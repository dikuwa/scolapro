-- Learner support is counselling/wellbeing data, not ordinary school administration.
-- Apply sensitivity-aware need-to-know rules and make interventions genuinely
-- append-oriented as documented by the domain model.

create or replace function app_private.has_explicit_support_role(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('counsellor','learner_support')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;
revoke all on function app_private.has_explicit_support_role(uuid) from public,anon,authenticated;

create or replace function app_private.can_create_learner_support_case(
  p_school_id uuid,
  p_sensitivity text
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select case
    when p_sensitivity='highly_restricted' then
      app_private.has_explicit_support_role(p_school_id)
    when p_sensitivity='restricted' then
      app_private.has_explicit_support_role(p_school_id)
      or exists(
        select 1 from public.school_memberships sm
        where sm.school_id=p_school_id
          and sm.user_id=(select auth.uid())
          and sm.role_key in ('principal','deputy_principal')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      )
    else false
  end;
$$;
revoke all on function app_private.can_create_learner_support_case(uuid,text) from public,anon,authenticated;

create or replace function app_private.can_access_learner_support_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.learner_support_cases c
    where c.id=p_case_id
      and (
        app_private.has_explicit_support_role(c.school_id)
        or c.opened_by_user_id=(select auth.uid())
        or exists(
          select 1
          from public.staff_members owner_staff
          where owner_staff.id=c.owner_staff_member_id
            and owner_staff.user_id=(select auth.uid())
            and owner_staff.status='active'
        )
        or (
          c.sensitivity='restricted'
          and exists(
            select 1 from public.school_memberships sm
            where sm.school_id=c.school_id
              and sm.user_id=(select auth.uid())
              and sm.role_key in ('principal','deputy_principal')
              and sm.active_from<=current_date
              and (sm.active_to is null or sm.active_to>=current_date)
          )
        )
      )
  );
$$;
revoke all on function app_private.can_access_learner_support_case(uuid) from public,anon,authenticated;

-- Retain the old helper name for callers, but narrow it to explicit support roles plus
-- school leadership. School administration and platform support are not counselling roles.
create or replace function app_private.can_manage_learner_support(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_explicit_support_role(target_school_id)
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=target_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;
revoke all on function app_private.can_manage_learner_support(uuid) from public,anon;
grant execute on function app_private.can_manage_learner_support(uuid) to authenticated;

drop policy if exists "restricted staff can read learner support cases" on public.learner_support_cases;
drop policy if exists "restricted staff can manage learner support cases" on public.learner_support_cases;

create policy "need to know users read learner support cases"
on public.learner_support_cases for select to authenticated
using (app_private.can_access_learner_support_case(id));

create policy "authorized users create learner support cases"
on public.learner_support_cases for insert to authenticated
with check (
  opened_by_user_id=(select auth.uid())
  and app_private.can_create_learner_support_case(school_id,sensitivity)
);

create policy "authorized users update learner support cases"
on public.learner_support_cases for update to authenticated
using (app_private.can_access_learner_support_case(id))
with check (app_private.can_create_learner_support_case(school_id,sensitivity));

drop policy if exists "restricted staff can read support interventions" on public.learner_support_interventions;
drop policy if exists "restricted staff can manage support interventions" on public.learner_support_interventions;

create policy "need to know users read support interventions"
on public.learner_support_interventions for select to authenticated
using (app_private.can_access_learner_support_case(support_case_id));

create policy "authorized users append support interventions"
on public.learner_support_interventions for insert to authenticated
with check (
  recorded_by_user_id=(select auth.uid())
  and app_private.can_access_learner_support_case(support_case_id)
);

revoke delete on public.learner_support_cases from authenticated;
revoke update,delete on public.learner_support_interventions from authenticated;

comment on function app_private.can_access_learner_support_case(uuid) is
'Sensitivity-aware counselling access. Highly restricted cases require explicit support role, case opener/owner, or platform admin; restricted cases additionally permit principal/deputy oversight.';
comment on table public.learner_support_interventions is
'Append-only counselling/support interventions. Authenticated clients may add authorized notes but may not rewrite or delete historical interventions.';