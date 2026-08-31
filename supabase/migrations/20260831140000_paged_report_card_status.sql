-- Bound report-card workspace reads at the database boundary. The page RPC preserves
-- the existing relationship-aware report snapshot visibility while returning at most
-- 100 learner rows. Management scope summaries aggregate school/grade/class counts
-- without shipping a complete roster, snapshot set, render-job set or document set.

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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not (
    app_private.has_school_access(p_school_id)
    or app_private.has_platform_role(array['platform_admin'])
  ) then
    raise exception 'Permission denied';
  end if;
  if p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_term_number<1 or p_term_number>6 then
    raise exception 'Term number is invalid';
  end if;
  if coalesce(p_report_status,'all') not in ('all','not_generated','generated','certified','published') then
    raise exception 'Unsupported report-card status filter';
  end if;

  return query
  with visible as (
    select
      e.id as enrolment_id,
      e.learner_id,
      l.first_names,
      l.surname,
      e.admission_number,
      e.grade_id,
      coalesce(g.display_name,'Unassigned') as grade_name,
      e.register_class_id,
      coalesce(rc.display_name,'Unassigned') as class_name,
      rs.id as snapshot_id,
      rs.snapshot_version,
      rs.template_version,
      case
        when rs.id is null then 'not_generated'
        when rs.status='draft' then 'generated'
        when rs.status='published' then 'published'
        else 'certified'
      end as report_status,
      rs.generated_at,
      rs.certified_at,
      case when rs.id is null then false else exists(
        select 1
        from public.report_card_documents d
        where d.snapshot_id=rs.id
          and d.school_id=p_school_id
          and d.document_format='pdf'
          and d.status='ready'
      ) end as pdf_ready
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    left join public.grades g on g.id=e.grade_id
    left join public.register_classes rc on rc.id=e.register_class_id
    left join lateral (
      select s.id,s.snapshot_version,s.template_version,s.status,s.generated_at,s.certified_at
      from public.report_card_snapshots s
      where s.school_id=p_school_id
        and s.academic_year=p_academic_year
        and s.enrolment_id=e.id
        and s.term_number=p_term_number
        and s.status<>'superseded'
        and app_private.can_read_report_card_snapshot(s.school_id,s.learner_id,s.status)
      order by s.snapshot_version desc
      limit 1
    ) rs on true
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status='current'
      and (p_grade_id is null or e.grade_id=p_grade_id)
      and (p_class_id is null or e.register_class_id=p_class_id)
      and (
        v_query is null
        or concat_ws(' ',l.first_names,l.surname,e.admission_number,g.display_name,rc.display_name) ilike '%' || v_query || '%'
      )
  ), filtered as (
    select *
    from visible v
    where coalesce(p_report_status,'all')='all'
      or v.report_status=p_report_status
  )
  select
    f.enrolment_id,
    f.learner_id,
    f.first_names,
    f.surname,
    f.admission_number,
    f.grade_id,
    f.grade_name,
    f.register_class_id,
    f.class_name,
    f.snapshot_id,
    f.snapshot_version,
    f.template_version,
    f.report_status,
    f.generated_at,
    f.certified_at,
    f.pdf_ready,
    count(*) over() as total_count
  from filtered f
  order by lower(f.surname),lower(f.first_names),f.enrolment_id
  limit v_page_size
  offset (v_page-1)*v_page_size;
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
  scope_type text,
  scope_id uuid,
  scope_label text,
  total_count bigint,
  not_generated_count bigint,
  generated_count bigint,
  certified_count bigint,
  published_count bigint,
  pdf_ready_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_scope_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then
    raise exception 'Permission denied';
  end if;
  if p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_term_number<1 or p_term_number>6 then
    raise exception 'Term number is invalid';
  end if;
  if p_scope_type not in ('school','grade','class') then
    raise exception 'Report-card summaries support school, grade or class scope only';
  end if;

  if p_scope_type='school' then
    if p_scope_id is not null then
      raise exception 'Whole-school scope does not accept a scope identifier';
    end if;
    if not exists(select 1 from public.schools s where s.id=p_school_id and s.status='active') then
      raise exception 'School not found or inactive';
    end if;
    v_scope_label:='Whole school';
  elsif p_scope_type='grade' then
    select g.display_name into v_scope_label
    from public.grades g
    where g.id=p_scope_id and g.school_id=p_school_id and g.academic_year=p_academic_year;
    if v_scope_label is null then
      raise exception 'Grade not found in this school and academic year';
    end if;
  else
    select rc.display_name into v_scope_label
    from public.register_classes rc
    where rc.id=p_scope_id and rc.school_id=p_school_id and rc.academic_year=p_academic_year;
    if v_scope_label is null then
      raise exception 'Register class not found in this school and academic year';
    end if;
  end if;

  return query
  with scoped as (
    select e.id as enrolment_id
    from public.enrolments e
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status='current'
      and (p_scope_type<>'grade' or e.grade_id=p_scope_id)
      and (p_scope_type<>'class' or e.register_class_id=p_scope_id)
  ), current_reports as (
    select
      sc.enrolment_id,
      rs.id as snapshot_id,
      rs.status,
      case when rs.id is null then false else exists(
        select 1 from public.report_card_documents d
        where d.snapshot_id=rs.id
          and d.school_id=p_school_id
          and d.document_format='pdf'
          and d.status='ready'
      ) end as pdf_ready
    from scoped sc
    left join lateral (
      select s.id,s.status
      from public.report_card_snapshots s
      where s.school_id=p_school_id
        and s.academic_year=p_academic_year
        and s.enrolment_id=sc.enrolment_id
        and s.term_number=p_term_number
        and s.status<>'superseded'
      order by s.snapshot_version desc
      limit 1
    ) rs on true
  )
  select
    p_scope_type,
    p_scope_id,
    v_scope_label,
    count(*)::bigint,
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
'Paged report-card learner/status read model. Returns at most 100 current enrolments and applies the canonical relationship-aware snapshot visibility predicate before exposing report status or artifacts.';
comment on function public.get_report_card_scope_summary(uuid,integer,integer,text,uuid) is
'Management-only report-card summary for whole-school, grade or register-class scopes. Aggregates current term status and ready-PDF counts without loading learner rows.';
