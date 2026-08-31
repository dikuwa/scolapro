-- Keep the paged report-card status roster available to actual school members while
-- preventing platform-support access from leaking learner roster data. The generic
-- has_school_access helper intentionally grants Platform Support support-safe access,
-- so this sensitive learner-facing read checks active school membership directly.

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
    exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=auth.uid()
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
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

comment on function public.list_report_card_status_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer) is
'Paged report-card status roster for active school members and platform administrators. Snapshot visibility remains relationship-aware; Platform Support cannot use support-safe school access to enumerate learner rosters.';
