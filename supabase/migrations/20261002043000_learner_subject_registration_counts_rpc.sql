create or replace function public.get_learner_subject_registration_counts(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  subject_offering_id uuid,
  registration_count bigint
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.can_manage_learner_subject_registrations(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    lsr.subject_offering_id,
    count(*)::bigint as registration_count
  from public.learner_subject_registrations lsr
  where lsr.school_id = p_school_id
    and lsr.academic_year = p_academic_year
    and lsr.status = 'active'
  group by lsr.subject_offering_id
  order by lsr.subject_offering_id;
end;
$$;

revoke all on function public.get_learner_subject_registration_counts(uuid,integer)
from public,anon;
grant execute on function public.get_learner_subject_registration_counts(uuid,integer)
to authenticated;

comment on function public.get_learner_subject_registration_counts(uuid,integer) is
  'Management-scoped aggregate for active learner subject registration counts. SECURITY DEFINER authorizes once through the canonical learner-subject management boundary, then groups by offering without repeating row-level authorization for every registration.';
