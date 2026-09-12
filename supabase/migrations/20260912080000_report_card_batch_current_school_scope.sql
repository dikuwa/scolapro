-- Complete #416 current-school hardening across report-card batch/read/retry surfaces.
-- Preserve Platform Admin governed cross-school authority, Platform Support denial,
-- guardian publication rules, worker-only mutation paths, and final snapshot/document semantics.

-- Durable batch visibility must follow the same management boundary as report snapshots.
drop policy if exists "report managers read report card batches" on public.report_card_batches;
create policy "report managers read report card batches"
on public.report_card_batches for select to authenticated
using (app_private.user_can_manage_report_cards((select auth.uid()),school_id));

drop policy if exists "report managers read report card batch items" on public.report_card_batch_items;
create policy "report managers read report card batch items"
on public.report_card_batch_items for select to authenticated
using (app_private.user_can_manage_report_cards((select auth.uid()),school_id));

-- Failed learner-item retries are operational mutations and therefore must re-check
-- the actor's present report-management authority rather than any still-active school role.
create or replace function public.retry_report_card_batch_failures(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if not app_private.user_can_manage_report_cards(auth.uid(),v_batch.school_id) then
    raise exception 'Permission denied';
  end if;

  update public.report_card_batch_items
  set status='pending',result_code=null,message=null,started_at=null,completed_at=null,updated_at=now()
  where batch_id=v_batch.id and status='failed';
  get diagnostics v_count=row_count;
  if v_count>0 then
    update public.report_card_batches set status='pending',completed_at=null,updated_at=now() where id=v_batch.id;
    perform app_private.refresh_report_card_batch(v_batch.id);
  end if;
  return v_count;
end;
$$;

revoke all on function public.retry_report_card_batch_failures(uuid) from public,anon;
grant execute on function public.retry_report_card_batch_failures(uuid) to authenticated;

create or replace function public.retry_report_card_batch_export(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if not app_private.user_can_manage_report_cards(auth.uid(),v_batch.school_id) then
    raise exception 'Permission denied';
  end if;
  if v_batch.operation<>'pdf' or v_batch.export_status<>'failed' then
    raise exception 'Only failed PDF batch exports can be retried';
  end if;
  update public.report_card_batches
  set export_status='waiting',export_error=null,updated_at=now()
  where id=v_batch.id;
  return true;
end;
$$;

revoke all on function public.retry_report_card_batch_export(uuid) from public,anon;
grant execute on function public.retry_report_card_batch_export(uuid) to authenticated;

-- SECURITY DEFINER paged status reads bypass table RLS, so explicitly bind ordinary
-- school-role reads to the deterministic current school. Platform Admin retains its
-- existing governed cross-school read authority.
create or replace function public.list_report_card_status_page(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_query text default null,
  p_grade_id uuid default null,
  p_class_id uuid default null,
  p_report_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  enrolment_id uuid,
  learner_id uuid,
  first_names text,
  surname text,
  admission_number text,
  grade_id uuid,
  grade_name text,
  register_class_id uuid,
  class_name text,
  snapshot_id uuid,
  snapshot_version integer,
  template_version text,
  report_status text,
  generated_at timestamptz,
  certified_at timestamptz,
  pdf_ready boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_page integer := greatest(coalesce(p_page,1),1);
  v_page_size integer := least(greatest(coalesce(p_page_size,50),1),100);
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
  v_current_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select sm.school_id into v_current_school_id
  from public.school_memberships sm
  where sm.user_id=auth.uid()
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
  order by sm.active_from desc,sm.id asc
  limit 1;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or (p_school_id=v_current_school_id and app_private.has_school_access(p_school_id))
  ) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if coalesce(p_report_status,'all') not in ('all','not_generated','generated','certified','published') then
    raise exception 'Unsupported report-card status filter';
  end if;

  return query
  with visible as (
    select e.id enrolment_id,e.learner_id,l.first_names,l.surname,e.admission_number,e.grade_id,
      coalesce(g.display_name,'Unassigned') grade_name,e.register_class_id,
      coalesce(rc.display_name,'Unassigned') class_name,rs.id snapshot_id,rs.snapshot_version,
      rs.template_version,
      case when rs.id is null then 'not_generated' when rs.status='draft' then 'generated'
           when rs.status='published' then 'published' else 'certified' end report_status,
      rs.generated_at,rs.certified_at,
      case when rs.id is null then false else exists(
        select 1 from public.report_card_documents d
        where d.snapshot_id=rs.id and d.school_id=p_school_id
          and d.document_format='pdf' and d.status='ready'
      ) end pdf_ready
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    left join public.grades g on g.id=e.grade_id
    left join public.register_classes rc on rc.id=e.register_class_id
    left join lateral (
      select s.id,s.snapshot_version,s.template_version,s.status,s.generated_at,s.certified_at
      from public.report_card_snapshots s
      where s.school_id=p_school_id and s.academic_year=p_academic_year
        and s.enrolment_id=e.id and s.term_number=p_term_number and s.status<>'superseded'
        and app_private.can_read_report_card_snapshot(s.school_id,s.learner_id,s.status)
      order by s.snapshot_version desc limit 1
    ) rs on true
    where e.school_id=p_school_id and e.academic_year=p_academic_year and e.status='current'
      and (p_grade_id is null or e.grade_id=p_grade_id)
      and (p_class_id is null or e.register_class_id=p_class_id)
      and (v_query is null or concat_ws(' ',l.first_names,l.surname,e.admission_number,g.display_name,rc.display_name) ilike '%'||v_query||'%')
  ), filtered as (
    select * from visible v
    where coalesce(p_report_status,'all')='all' or v.report_status=p_report_status
  )
  select f.enrolment_id,f.learner_id,f.first_names,f.surname,f.admission_number,f.grade_id,
    f.grade_name,f.register_class_id,f.class_name,f.snapshot_id,f.snapshot_version,f.template_version,
    f.report_status,f.generated_at,f.certified_at,f.pdf_ready,count(*) over()
  from filtered f
  order by lower(f.surname),lower(f.first_names),f.enrolment_id
  limit v_page_size offset (v_page-1)*v_page_size;
end;
$$;

revoke all on function public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer) to authenticated;

create or replace function public.get_report_card_scope_summary(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_scope_type text,
  p_scope_id uuid default null
)
returns table(
  scope_type text,scope_id uuid,scope_label text,total_count bigint,not_generated_count bigint,
  generated_count bigint,certified_count bigint,published_count bigint,pdf_ready_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_scope_label text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_manage_report_cards(auth.uid(),p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if p_scope_type not in ('school','grade','class') then raise exception 'Report-card summaries support school, grade or class scope only'; end if;

  if p_scope_type='school' then
    if p_scope_id is not null then raise exception 'Whole-school scope does not accept a scope identifier'; end if;
    if not exists(select 1 from public.schools s where s.id=p_school_id and s.status='active') then raise exception 'School not found or inactive'; end if;
    v_scope_label:='Whole school';
  elsif p_scope_type='grade' then
    select g.display_name into v_scope_label from public.grades g
    where g.id=p_scope_id and g.school_id=p_school_id and g.academic_year=p_academic_year;
    if v_scope_label is null then raise exception 'Grade not found in this school and academic year'; end if;
  else
    select rc.display_name into v_scope_label from public.register_classes rc
    where rc.id=p_scope_id and rc.school_id=p_school_id and rc.academic_year=p_academic_year;
    if v_scope_label is null then raise exception 'Register class not found in this school and academic year'; end if;
  end if;

  return query
  with scoped as (
    select e.id enrolment_id from public.enrolments e
    where e.school_id=p_school_id and e.academic_year=p_academic_year and e.status='current'
      and (p_scope_type<>'grade' or e.grade_id=p_scope_id)
      and (p_scope_type<>'class' or e.register_class_id=p_scope_id)
  ), current_reports as (
    select sc.enrolment_id,rs.id snapshot_id,rs.status,
      case when rs.id is null then false else exists(
        select 1 from public.report_card_documents d
        where d.snapshot_id=rs.id and d.school_id=p_school_id and d.document_format='pdf' and d.status='ready'
      ) end pdf_ready
    from scoped sc
    left join lateral (
      select s.id,s.status from public.report_card_snapshots s
      where s.school_id=p_school_id and s.academic_year=p_academic_year
        and s.enrolment_id=sc.enrolment_id and s.term_number=p_term_number and s.status<>'superseded'
      order by s.snapshot_version desc limit 1
    ) rs on true
  )
  select p_scope_type,p_scope_id,v_scope_label,count(*)::bigint,
    count(*) filter(where cr.snapshot_id is null)::bigint,
    count(*) filter(where cr.status='draft')::bigint,
    count(*) filter(where cr.status='certified')::bigint,
    count(*) filter(where cr.status='published')::bigint,
    count(*) filter(where cr.pdf_ready)::bigint
  from current_reports cr;
end;
$$;

revoke all on function public.get_report_card_scope_summary(uuid,integer,integer,text,uuid) from public,anon;
grant execute on function public.get_report_card_scope_summary(uuid,integer,integer,text,uuid) to authenticated;

comment on function public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer) is
'Paged report-card learner/status read model. School-role access is bounded to the deterministic current school; Platform Admin retains governed cross-school visibility.';
comment on function public.get_report_card_scope_summary(uuid,integer,integer,text,uuid) is
'Management-only report-card summary bounded to deterministic current-school authority, with existing Platform Admin governance preserved.';
