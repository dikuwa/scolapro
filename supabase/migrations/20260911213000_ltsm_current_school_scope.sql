-- LTSM/library circulation is a school-local operational workflow. Keep the
-- explicit-user helper usable for historical actor-integrity validation, while
-- binding authenticated operational access to the deterministic current school.

create or replace function app_private.user_can_manage_ltsm(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.user_id = p_user_id
      and sm.school_id = p_school_id
      and sm.role_key in ('school_admin','principal','deputy_principal','librarian','ltsm')
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
  );
$$;

revoke all on function app_private.user_can_manage_ltsm(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.can_manage_ltsm(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with current_school as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select exists (
    select 1
    from current_school cs
    where cs.school_id = target_school_id
  )
  and app_private.user_can_manage_ltsm((select auth.uid()), target_school_id);
$$;

revoke all on function app_private.can_manage_ltsm(uuid) from public, anon;
grant execute on function app_private.can_manage_ltsm(uuid) to authenticated;

create or replace function app_private.can_view_current_school_ltsm(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with current_school as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select exists (
    select 1
    from current_school cs
    where cs.school_id = p_school_id
  )
  and app_private.can_view_operational_learners(p_school_id);
$$;

revoke all on function app_private.can_view_current_school_ltsm(uuid) from public, anon;
grant execute on function app_private.can_view_current_school_ltsm(uuid) to authenticated;

-- Replace both legacy foundation policy names and any intermediate names from
-- this audit branch. PostgreSQL SELECT policies are permissive, so leaving the
-- foundation policy in place would continue exposing another active school.
drop policy if exists "authorized staff can read learning resource titles" on public.learning_resource_titles;
drop policy if exists "authorized staff can read resource titles" on public.learning_resource_titles;
create policy "authorized staff can read learning resource titles"
on public.learning_resource_titles
for select to authenticated
using (app_private.can_view_current_school_ltsm(school_id));

drop policy if exists "authorized staff can read learning resource copies" on public.learning_resource_copies;
drop policy if exists "authorized staff can read resource copies" on public.learning_resource_copies;
create policy "authorized staff can read learning resource copies"
on public.learning_resource_copies
for select to authenticated
using (app_private.can_view_current_school_ltsm(school_id));

drop policy if exists "authorized staff can read learning resource loans" on public.learning_resource_loans;
drop policy if exists "authorized staff can read resource loans" on public.learning_resource_loans;
create policy "authorized staff can read learning resource loans"
on public.learning_resource_loans
for select to authenticated
using (app_private.can_view_current_school_ltsm(school_id));

comment on function app_private.user_can_manage_ltsm(uuid,uuid) is
'Explicit-user LTSM authority predicate used for provenance validation. It evaluates the supplied user effective school role without borrowing auth.uid() current-school context.';

comment on function app_private.can_manage_ltsm(uuid) is
'Authenticated LTSM management predicate bound to the actor deterministic current school (active_from DESC, id ASC).';

comment on function app_private.can_view_current_school_ltsm(uuid) is
'Authenticated LTSM read predicate preserving existing operational learner role semantics while restricting reads to the deterministic current school.';
