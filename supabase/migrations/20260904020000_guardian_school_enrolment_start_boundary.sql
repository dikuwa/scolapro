-- Guardian school-side visibility and authoritative edits are scoped to a linked
-- current learner. `status='current'` alone does not prove the enrolment has started,
-- so require the enrolment effective period as well. Guardian self-access through an
-- explicit guardian_user_link remains independent of the learner's school dates.

create or replace function app_private.can_manage_guardians_for_learner(p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.enrolments e
      join public.school_memberships sm on sm.school_id=e.school_id
      where e.learner_id=p_learner_id
        and e.status='current'
        and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.can_manage_guardians_for_learner(uuid)
from public,anon;
grant execute on function app_private.can_manage_guardians_for_learner(uuid)
to authenticated;

create or replace function app_private.can_read_guardian(p_guardian_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.guardian_user_links gul
      where gul.guardian_id=p_guardian_id
        and gul.user_id=(select auth.uid())
    )
    or exists(
      select 1
      from public.learner_guardians lg
      join public.enrolments e on e.learner_id=lg.learner_id
      where lg.guardian_id=p_guardian_id
        and lg.effective_from<=current_date
        and (lg.effective_to is null or lg.effective_to>=current_date)
        and e.status='current'
        and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
        and (
          app_private.can_access_learner_observations(e.school_id,e.learner_id)
          or exists(
            select 1
            from public.school_memberships sm
            where sm.school_id=e.school_id
              and sm.user_id=(select auth.uid())
              and sm.role_key='hod'
              and sm.active_from<=current_date
              and (sm.active_to is null or sm.active_to>=current_date)
          )
        )
    );
$$;

revoke all on function app_private.can_read_guardian(uuid)
from public,anon;
grant execute on function app_private.can_read_guardian(uuid)
to authenticated;

comment on function app_private.can_manage_guardians_for_learner(uuid) is
'Authoritative guardian record management is limited to Platform Admin or current school leadership/counsellor for a learner whose current-status enrolment is effective today.';

comment on function app_private.can_read_guardian(uuid) is
'Guardian-directory read scope: linked guardian self-access, Platform Admin, or authorised school staff for a linked guardian relationship and learner enrolment both effective today.';
