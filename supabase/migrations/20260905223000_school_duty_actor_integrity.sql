create or replace function app_private.user_can_manage_school_duties(
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
    where sm.school_id = p_school_id
      and sm.user_id = p_user_id
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;

revoke all on function app_private.user_can_manage_school_duties(uuid,uuid)
from public, anon, authenticated;

comment on function app_private.user_can_manage_school_duties(uuid,uuid) is
'Arbitrary-user mirror of the existing school-duty management policy for physical creator provenance enforcement.';

create or replace function app_private.enforce_school_duty_assignment_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and new.assigned_by_user_id is distinct from auth.uid() then
      raise exception 'School duty assigner must match authenticated actor';
    end if;

    if not app_private.user_can_manage_school_duties(new.assigned_by_user_id, new.school_id) then
      raise exception 'School duty assigner is not authorized for school';
    end if;

    return new;
  end if;

  if new.assigned_by_user_id is distinct from old.assigned_by_user_id then
    raise exception 'School duty assigner provenance is immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_duty_assignment_actor_integrity()
from public, anon, authenticated;

comment on function app_private.enforce_school_duty_assignment_actor_integrity() is
'Physically binds school-duty assignment creation to a currently authorized school leader and freezes creator provenance.';

-- Keep the existing scope trigger first alphabetically so malformed scope continues
-- to fail on the relationship invariant before actor provenance is evaluated.
drop trigger if exists school_duty_assignment_actor_integrity_trg
on public.school_duty_assignments;
create trigger school_duty_assignment_submit_actor_integrity_trg
before insert or update of assigned_by_user_id, school_id
on public.school_duty_assignments
for each row execute function app_private.enforce_school_duty_assignment_actor_integrity();
