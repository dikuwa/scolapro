-- Preserve existing assignment-scoped learner identity semantics for teachers/photos.
-- The paged directory remains placement-gated separately; raw identity access must not
-- require a staff_school_assignments row in addition to the canonical observation/
-- class-assignment predicates. Deterministic current-school and effective enrolment
-- boundaries still apply before those existing predicates are evaluated.

create or replace function app_private.can_read_learner_identity(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with current_membership as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id=(select auth.uid())
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select app_private.has_platform_role(array['platform_admin'])
    or (
      not app_private.has_platform_role(array['platform_support'])
      and exists(
        select 1 from current_membership cm where cm.school_id=p_school_id
      )
      and exists(
        select 1
        from public.enrolments e
        where e.school_id=p_school_id
          and e.learner_id=p_learner_id
          and e.status='current'
          and e.enrolled_from <= (now() at time zone 'Africa/Windhoek')::date
          and (e.enrolled_to is null or e.enrolled_to >= (now() at time zone 'Africa/Windhoek')::date)
      )
      and (
        app_private.has_school_local_role(
          p_school_id,
          array['school_admin','principal','deputy_principal','counsellor']
        )
        or app_private.can_access_learner_observations_school_scoped(p_school_id,p_learner_id)
      )
    );
$$;

revoke all on function app_private.can_read_learner_identity(uuid,uuid) from public,anon;
grant execute on function app_private.can_read_learner_identity(uuid,uuid) to authenticated;

comment on function app_private.can_read_learner_identity(uuid,uuid) is
'Raw learner identity scope: Platform Admin, or an effective current enrolment in the actor deterministic current school plus the existing management or assignment-scoped learner predicate. Platform Support is excluded.';
