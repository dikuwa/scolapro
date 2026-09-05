-- Provide an enrolment-bound report-card status read for Individual mode.
-- This intentionally mirrors the governed visibility/status semantics of
-- list_report_card_status_page without relying on learner-name/admission search.

create or replace function public.get_report_card_status_for_enrolment(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_enrolment_id uuid
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
  pdf_ready boolean
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
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

  return query
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
  where e.id=p_enrolment_id
    and e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and e.status='current'
  limit 1;
end;
$$;

revoke all on function public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid) from public,anon;
grant execute on function public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid) to authenticated;

comment on function public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid) is
'Exact current-enrolment report-card status read for Individual mode. Uses the same school membership and snapshot visibility semantics as the paged roster without fuzzy learner search.';
