create or replace function app_private.enforce_school_membership_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_staff_tenant uuid;
  v_staff_user_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'School membership tenant, school, and user identity are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School membership scope mismatch: school does not belong to tenant';
  end if;

  if new.staff_member_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.staff_member_id::text, 0));

    select sm.tenant_id, sm.user_id
      into v_staff_tenant, v_staff_user_id
      from public.staff_members sm
     where sm.id = new.staff_member_id;

    if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
      raise exception 'School membership scope mismatch: staff member does not belong to tenant';
    end if;

    if v_staff_user_id is not null and v_staff_user_id <> new.user_id then
      raise exception 'School membership scope mismatch: staff member is linked to another user account';
    end if;

    if exists (
      select 1
        from public.school_memberships existing
       where existing.staff_member_id = new.staff_member_id
         and existing.user_id <> new.user_id
         and existing.id <> new.id
    ) then
      raise exception 'School membership scope mismatch: staff identity is already attached to another user account';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_membership_scope_integrity() from public, anon, authenticated;

create or replace function app_private.enforce_staff_member_membership_identity_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.id::text, 0));

  if exists (
    select 1
      from public.school_memberships membership
     where membership.staff_member_id = new.id
       and membership.user_id <> new.user_id
  ) then
    raise exception 'Staff member account does not match linked school membership account';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_staff_member_membership_identity_integrity() from public, anon, authenticated;

drop trigger if exists staff_member_membership_identity_integrity_trg on public.staff_members;
create trigger staff_member_membership_identity_integrity_trg
before insert or update of user_id
on public.staff_members
for each row execute function app_private.enforce_staff_member_membership_identity_integrity();

comment on function app_private.enforce_school_membership_scope_integrity() is
'Keeps school memberships in the correct tenant/school and prevents a staff identity from being attached to a different or multiple user accounts.';

comment on function app_private.enforce_staff_member_membership_identity_integrity() is
'Prevents a staff account link from contradicting the user account already represented by that staff identity in school memberships.';
