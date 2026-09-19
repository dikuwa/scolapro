-- Issue #529: learner-support current-school/current-placement confidentiality hardening.
--
-- Conduct and achievement already use deterministic current-school observation scope.
-- Keep the confidential learner-support store separate, preserve the later social-worker
-- boundary, and require current staff placement when a school membership is linked to
-- a staff identity. Historical case/intervention facts are not rewritten.

create or replace function app_private.user_has_explicit_support_role(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_current_school_matches(p_user_id, p_school_id)
    and exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('counsellor','learner_support','social_worker')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
        and (
          sm.staff_member_id is null
          or exists(
            select 1
            from public.staff_school_assignments ssa
            where ssa.staff_member_id = sm.staff_member_id
              and ssa.tenant_id = sm.tenant_id
              and ssa.school_id = sm.school_id
              and ssa.effective_from <= current_date
              and (ssa.effective_to is null or ssa.effective_to >= current_date)
          )
        )
    );
$$;

revoke all on function app_private.user_has_explicit_support_role(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.has_explicit_support_role(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_has_explicit_support_role((select auth.uid()), p_school_id);
$$;

revoke all on function app_private.has_explicit_support_role(uuid)
  from public, anon, authenticated;

create or replace function app_private.user_can_create_learner_support_case(
  p_user_id uuid,
  p_school_id uuid,
  p_sensitivity text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select case
    when p_sensitivity = 'highly_restricted' then
      app_private.user_has_explicit_support_role(p_user_id, p_school_id)
    when p_sensitivity = 'restricted' then
      app_private.user_has_explicit_support_role(p_user_id, p_school_id)
      or (
        app_private.user_current_school_matches(p_user_id, p_school_id)
        and exists(
          select 1
          from public.school_memberships sm
          where sm.school_id = p_school_id
            and sm.user_id = p_user_id
            and sm.role_key in ('principal','deputy_principal')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and (
              sm.staff_member_id is null
              or exists(
                select 1
                from public.staff_school_assignments ssa
                where ssa.staff_member_id = sm.staff_member_id
                  and ssa.tenant_id = sm.tenant_id
                  and ssa.school_id = sm.school_id
                  and ssa.effective_from <= current_date
                  and (ssa.effective_to is null or ssa.effective_to >= current_date)
              )
            )
        )
      )
    else false
  end;
$$;

revoke all on function app_private.user_can_create_learner_support_case(uuid,uuid,text)
  from public, anon, authenticated;

create or replace function app_private.can_create_learner_support_case(
  p_school_id uuid,
  p_sensitivity text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_create_learner_support_case(
    (select auth.uid()),
    p_school_id,
    p_sensitivity
  );
$$;

revoke all on function app_private.can_create_learner_support_case(uuid,text)
  from public, anon, authenticated;

create or replace function app_private.user_can_manage_learner_support(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_has_explicit_support_role(p_user_id, p_school_id)
    or (
      app_private.user_current_school_matches(p_user_id, p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.school_id = p_school_id
          and sm.user_id = p_user_id
          and sm.role_key in ('principal','deputy_principal')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
          and (
            sm.staff_member_id is null
            or exists(
              select 1
              from public.staff_school_assignments ssa
              where ssa.staff_member_id = sm.staff_member_id
                and ssa.tenant_id = sm.tenant_id
                and ssa.school_id = sm.school_id
                and ssa.effective_from <= current_date
                and (ssa.effective_to is null or ssa.effective_to >= current_date)
            )
          )
      )
    );
$$;

revoke all on function app_private.user_can_manage_learner_support(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.user_can_access_learner_support_case(
  p_user_id uuid,
  p_case_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists(
    select 1
    from public.learner_support_cases c
    where c.id = p_case_id
      and (
        app_private.user_has_explicit_support_role(p_user_id, c.school_id)
        or exists(
          select 1
          from public.staff_members owner_staff
          where owner_staff.id = c.owner_staff_member_id
            and owner_staff.user_id = p_user_id
            and owner_staff.tenant_id = c.tenant_id
            and owner_staff.status = 'active'
            and exists(
              select 1
              from public.staff_school_assignments ssa
              where ssa.staff_member_id = owner_staff.id
                and ssa.tenant_id = c.tenant_id
                and ssa.school_id = c.school_id
                and ssa.effective_from <= current_date
                and (ssa.effective_to is null or ssa.effective_to >= current_date)
            )
        )
        or (
          c.sensitivity = 'restricted'
          and app_private.user_can_manage_learner_support(p_user_id, c.school_id)
        )
      )
  );
$$;

revoke all on function app_private.user_can_access_learner_support_case(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.can_access_learner_support_case(
  p_case_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_access_learner_support_case(
    (select auth.uid()),
    p_case_id
  );
$$;

revoke all on function app_private.can_access_learner_support_case(uuid)
  from public, anon;
grant execute on function app_private.can_access_learner_support_case(uuid)
  to authenticated;

create or replace function app_private.can_manage_learner_support(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_manage_learner_support(
    (select auth.uid()),
    target_school_id
  );
$$;

revoke all on function app_private.can_manage_learner_support(uuid)
  from public, anon;
grant execute on function app_private.can_manage_learner_support(uuid)
  to authenticated;

comment on function app_private.user_has_explicit_support_role(uuid,uuid) is
'Confidential learner-support authority for an arbitrary actor. Only current-school counsellor, learner-support or social-worker roles qualify; linked staff identities require current school placement. Platform Admin and Platform Support are excluded.';

comment on function app_private.user_can_manage_learner_support(uuid,uuid) is
'Confidential support-management authority bound to the deterministic current school and current linked staff placement. Social-worker authority is preserved; platform roles are excluded.';

comment on function app_private.user_can_access_learner_support_case(uuid,uuid) is
'Confidential support-case access for provenance guards: current-school/current-placement support authority, current placed case ownership, or current-school principal/deputy oversight for restricted cases. Historical rows remain unchanged when authority later ends.';

comment on function app_private.can_manage_learner_support(uuid) is
'Current authenticated confidential learner-support authority. Ordinary teacher, HOD, school-admin, Platform Admin and Platform Support roles do not gain access.';
