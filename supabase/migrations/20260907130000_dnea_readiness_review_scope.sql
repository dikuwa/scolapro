-- N08: purpose-built DNEA readiness projections.
-- Network reviewers receive school/cycle exception summaries only. Candidate identity,
-- learner facts and subject registrations remain school-scoped through the existing
-- examination-management permission boundary.

create or replace function public.list_dnea_readiness_scope(
  p_as_of date default current_date
)
returns table (
  school_id uuid,
  school_name text,
  examination_cycle_id uuid,
  cycle_key text,
  cycle_name text,
  academic_year integer,
  candidate_count bigint,
  ready_count bigint,
  blocking_count bigint,
  warning_count bigint,
  access_scope text
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select
    c.school_id,
    s.name as school_name,
    c.id as examination_cycle_id,
    c.cycle_key,
    c.display_name as cycle_name,
    c.academic_year,
    (select count(*) from public.examination_candidates ec
      where ec.examination_cycle_id = c.id and ec.registration_status <> 'withdrawn') as candidate_count,
    (select count(*) from public.examination_candidates ec
      where ec.examination_cycle_id = c.id
        and ec.registration_status <> 'withdrawn'
        and not exists (
          select 1 from public.examination_readiness_issues ri
          where ri.examination_cycle_id = c.id
            and ri.candidate_id = ec.id
            and ri.resolved = false
            and ri.severity = 'blocking'
        )) as ready_count,
    (select count(*) from public.examination_readiness_issues ri
      where ri.examination_cycle_id = c.id and ri.resolved = false and ri.severity = 'blocking') as blocking_count,
    (select count(*) from public.examination_readiness_issues ri
      where ri.examination_cycle_id = c.id and ri.resolved = false and ri.severity = 'warning') as warning_count,
    case when app_private.can_manage_examinations(c.school_id) then 'school' else 'network' end as access_scope
  from public.examination_cycles c
  join public.schools s on s.id = c.school_id
  where auth.uid() is not null
    and (
      app_private.can_manage_examinations(c.school_id)
      or app_private.can_view_school_via_network(c.school_id, p_as_of)
    )
  order by c.academic_year desc, s.name, c.display_name;
$$;

revoke all on function public.list_dnea_readiness_scope(date) from public, anon;
grant execute on function public.list_dnea_readiness_scope(date) to authenticated;

comment on function public.list_dnea_readiness_scope(date) is
'DNEA N08 readiness summary for existing school examination managers and effective circuit/regional network members. The projection intentionally excludes learner/candidate identity and support data.';

create or replace function public.get_dnea_candidate_readiness(
  p_cycle_id uuid
)
returns table (
  candidate_id uuid,
  learner_name text,
  candidate_number text,
  registration_status text,
  identity_verified boolean,
  subject_count bigint,
  subjects jsonb,
  unresolved_issues jsonb,
  is_ready boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_cycle public.examination_cycles%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_cycle from public.examination_cycles where id = p_cycle_id;
  if not found then raise exception 'Examination cycle not found'; end if;
  if not app_private.can_manage_examinations(v_cycle.school_id) then raise exception 'Permission denied'; end if;

  return query
  select
    ec.id,
    concat_ws(' ', nullif(btrim(l.first_names), ''), nullif(btrim(l.surname), '')),
    ec.candidate_number,
    ec.registration_status,
    ec.identity_verified,
    (select count(*) from public.examination_subject_registrations r
      where r.candidate_id = ec.id and r.registration_status <> 'withdrawn'),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'code', r.subject_code, 'name', r.subject_name, 'status', r.registration_status
      ) order by r.subject_code)
      from public.examination_subject_registrations r
      where r.candidate_id = ec.id and r.registration_status <> 'withdrawn'), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'code', i.issue_code, 'severity', i.severity, 'message', i.message,
        'subjectRegistrationId', i.subject_registration_id
      ) order by case i.severity when 'blocking' then 0 else 1 end, i.issue_code)
      from public.examination_readiness_issues i
      where i.examination_cycle_id = ec.examination_cycle_id
        and i.candidate_id = ec.id and i.resolved = false), '[]'::jsonb),
    not exists (select 1 from public.examination_readiness_issues i
      where i.examination_cycle_id = ec.examination_cycle_id
        and i.candidate_id = ec.id and i.resolved = false and i.severity = 'blocking')
  from public.examination_candidates ec
  join public.learners l on l.id = ec.learner_id
  where ec.examination_cycle_id = p_cycle_id
    and ec.registration_status <> 'withdrawn'
  order by l.surname, l.first_names, ec.id;
end;
$$;

revoke all on function public.get_dnea_candidate_readiness(uuid) from public, anon;
grant execute on function public.get_dnea_candidate_readiness(uuid) to authenticated;

comment on function public.get_dnea_candidate_readiness(uuid) is
'DNEA N08 candidate/subject readiness detail for existing school examination managers only. Network membership alone is insufficient by design.';
