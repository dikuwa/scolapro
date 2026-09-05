-- Staff-school placement provenance is operationally authoritative. Authenticated
-- writes must identify themselves immediately; trusted/bootstrap writers are checked
-- transactionally at commit so a placement and its authorizing membership may be
-- established atomically in either statement order.

create or replace function app_private.user_can_manage_staff_school_assignment(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.user_id=p_user_id
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  ) or exists(
    select 1
    from public.platform_memberships pm
    where pm.user_id=p_user_id
      and pm.role_key='platform_admin'
      and pm.active_from<=current_date
      and (pm.active_to is null or pm.active_to>=current_date)
  );
$$;
revoke all on function app_private.user_can_manage_staff_school_assignment(uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.enforce_staff_school_assignment_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if tg_op='UPDATE' and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Staff assignment creator provenance is immutable';
  end if;

  if tg_op='INSERT' and auth.uid() is not null and new.created_by_user_id<>auth.uid() then
    raise exception 'Staff assignment creator must match authenticated actor';
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_staff_school_assignment_actor_integrity()
from public,anon,authenticated;

create or replace function app_private.enforce_staff_school_assignment_actor_commit_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if new.created_by_user_id is null then
    raise exception 'Staff assignment creator is required';
  end if;

  if not app_private.user_can_manage_staff_school_assignment(new.created_by_user_id,new.school_id) then
    raise exception 'Staff assignment creator is not authorized for school';
  end if;

  return null;
end;
$$;
revoke all on function app_private.enforce_staff_school_assignment_actor_commit_integrity()
from public,anon,authenticated;

drop trigger if exists staff_school_assignment_submit_actor_integrity_trg on public.staff_school_assignments;
create trigger staff_school_assignment_submit_actor_integrity_trg
before insert or update of created_by_user_id
on public.staff_school_assignments
for each row execute function app_private.enforce_staff_school_assignment_actor_integrity();

drop trigger if exists staff_school_assignment_actor_commit_integrity_trg on public.staff_school_assignments;
create constraint trigger staff_school_assignment_actor_commit_integrity_trg
after insert or update of school_id,created_by_user_id
on public.staff_school_assignments
deferrable initially deferred
for each row execute function app_private.enforce_staff_school_assignment_actor_commit_integrity();

comment on function app_private.user_can_manage_staff_school_assignment(uuid,uuid) is
'Arbitrary-user authority mirror for durable staff-school placement creator provenance. Trusted/bootstrap writes are validated by a deferred constraint trigger at transaction commit.';