-- Replace the enrolments SELECT policy's per-row learner-identity self-scan
-- with a row-aware helper. This preserves existing current-school/role semantics
-- while avoiding re-querying public.enrolments to prove the row currently being
-- evaluated is itself a current enrolment.

create or replace function app_private.can_read_enrolment_row(
  p_school_id uuid,
  p_learner_id uuid,
  p_status text,
  p_enrolled_from date,
  p_enrolled_to date
)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_today date := (now() at time zone 'Africa/Windhoek')::date;
  v_platform_admin boolean := false;
  v_platform_support boolean := false;
  v_membership_school_id uuid;
  v_role_key text;
  v_staff_member_id uuid;
begin
  if p_school_id is null or p_learner_id is null then
    return false;
  end if;

  select
    coalesce(bool_or(pm.role_key='platform_admin'),false),
    coalesce(bool_or(pm.role_key='platform_support'),false)
  into v_platform_admin, v_platform_support
  from public.platform_memberships pm
  where pm.user_id=(select auth.uid())
    and pm.role_key in ('platform_admin','platform_support')
    and pm.active_from<=v_today
    and (pm.active_to is null or pm.active_to>=v_today);

  -- Preserve the existing raw-identity ordering: governed Platform Admin wins
  -- even if a support role also exists on the same account.
  if v_platform_admin then
    return true;
  end if;
  if v_platform_support then
    return false;
  end if;

  select sm.school_id, sm.role_key, sm.staff_member_id
    into v_membership_school_id, v_role_key, v_staff_member_id
  from public.school_memberships sm
  where sm.user_id=(select auth.uid())
    and sm.active_from<=v_today
    and (sm.active_to is null or sm.active_to>=v_today)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if not found or v_membership_school_id is distinct from p_school_id then
    return false;
  end if;

  -- For school-local actors, the existing learner-identity helper requires a
  -- current/effective enrolment. On this table the row already contains that
  -- evidence, so do not self-query public.enrolments again.
  if p_status <> 'current'
     or p_enrolled_from > v_today
     or (p_enrolled_to is not null and p_enrolled_to < v_today) then
    return false;
  end if;

  if v_role_key = any(array['school_admin','principal','deputy_principal','counsellor']) then
    if v_staff_member_id is null or exists (
      select 1
      from public.staff_school_assignments ssa
      where ssa.staff_member_id=v_staff_member_id
        and ssa.school_id=p_school_id
        and ssa.effective_from<=v_today
        and (ssa.effective_to is null or ssa.effective_to>=v_today)
    ) then
      return true;
    end if;
  end if;

  -- Preserve existing class-teacher/teacher/social-worker and compatibility
  -- semantics through the established scoped learner-observation authority.
  return app_private.can_access_learner_observations_school_scoped(
    p_school_id,
    p_learner_id
  );
end;
$$;

revoke all on function app_private.can_read_enrolment_row(uuid,uuid,text,date,date) from public,anon;
grant execute on function app_private.can_read_enrolment_row(uuid,uuid,text,date,date) to authenticated;

drop policy if exists "scoped staff read enrolments" on public.enrolments;
create policy "scoped staff read enrolments"
on public.enrolments
for select
to authenticated
using (
  app_private.can_read_enrolment_row(
    school_id,
    learner_id,
    status,
    enrolled_from,
    enrolled_to
  )
);

comment on function app_private.can_read_enrolment_row(uuid,uuid,text,date,date)
is 'Row-aware enrolment read authorization. Avoids the redundant enrolments self-scan performed by can_read_learner_identity while preserving current-school, platform and scoped-teacher boundaries.';
