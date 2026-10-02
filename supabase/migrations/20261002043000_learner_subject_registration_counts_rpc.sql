create or replace function public.get_learner_subject_registration_counts(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  subject_offering_id uuid,
  registration_count bigint
)
language sql
stable
security invoker
set search_path=pg_catalog
as $$
  select
    lsr.subject_offering_id,
    count(*)::bigint as registration_count
  from public.learner_subject_registrations lsr
  where lsr.school_id = p_school_id
    and lsr.academic_year = p_academic_year
    and lsr.status = 'active'
  group by lsr.subject_offering_id
  order by lsr.subject_offering_id;
$$;

revoke all on function public.get_learner_subject_registration_counts(uuid,integer)
from public,anon;
grant execute on function public.get_learner_subject_registration_counts(uuid,integer)
to authenticated;

comment on function public.get_learner_subject_registration_counts(uuid,integer) is
  'Returns active learner subject registration counts grouped by offering. SECURITY INVOKER preserves learner_subject_registrations RLS so callers only aggregate rows they are already permitted to read.';
