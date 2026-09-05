-- Guardian contact/address authorship and account-link provenance are durable identity
-- governance records. Bind their actor fields to an actually-authorized user and
-- prevent later attribution rewrites, including through trusted writers.

create or replace function app_private.user_can_manage_guardian_actor(
  p_user_id uuid,
  p_guardian_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.learner_guardians lg
    join public.enrolments e on e.learner_id=lg.learner_id
    join public.school_memberships sm on sm.school_id=e.school_id
    where lg.guardian_id=p_guardian_id
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
      and e.status='current'
      and e.enrolled_from<=current_date
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
      and sm.user_id=p_user_id
      and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','class_teacher')
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
revoke all on function app_private.user_can_manage_guardian_actor(uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.user_can_claim_guardian_actor(
  p_user_id uuid,
  p_guardian_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
  select exists(
    select 1
    from auth.users u
    join public.guardian_contacts gc
      on gc.guardian_id=p_guardian_id
     and gc.contact_type='email'
     and gc.effective_from<=current_date
     and (gc.effective_to is null or gc.effective_to>=current_date)
    where u.id=p_user_id
      and u.email is not null
      and lower(btrim(gc.contact_value))=lower(btrim(u.email))
  );
$$;
revoke all on function app_private.user_can_claim_guardian_actor(uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.enforce_guardian_contact_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if tg_op='UPDATE' and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Guardian contact creator provenance is immutable';
  end if;
  if tg_op='INSERT' then
    if new.created_by_user_id is null then raise exception 'Guardian contact creator is required'; end if;
    if auth.uid() is not null and new.created_by_user_id<>auth.uid() then
      raise exception 'Guardian contact creator must match authenticated actor';
    end if;
    if not app_private.user_can_manage_guardian_actor(new.created_by_user_id,new.guardian_id) then
      raise exception 'Guardian contact creator is not authorized for guardian';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_guardian_contact_actor_integrity()
from public,anon,authenticated;

drop trigger if exists guardian_contact_submit_actor_integrity_trg on public.guardian_contacts;
create trigger guardian_contact_submit_actor_integrity_trg
before insert or update of created_by_user_id on public.guardian_contacts
for each row execute function app_private.enforce_guardian_contact_actor_integrity();

create or replace function app_private.enforce_guardian_address_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if tg_op='UPDATE' and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Guardian address creator provenance is immutable';
  end if;
  if tg_op='INSERT' then
    if new.created_by_user_id is null then raise exception 'Guardian address creator is required'; end if;
    if auth.uid() is not null and new.created_by_user_id<>auth.uid() then
      raise exception 'Guardian address creator must match authenticated actor';
    end if;
    if not app_private.user_can_manage_guardian_actor(new.created_by_user_id,new.guardian_id) then
      raise exception 'Guardian address creator is not authorized for guardian';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_guardian_address_actor_integrity()
from public,anon,authenticated;

drop trigger if exists guardian_address_submit_actor_integrity_trg on public.guardian_addresses;
create trigger guardian_address_submit_actor_integrity_trg
before insert or update of created_by_user_id on public.guardian_addresses
for each row execute function app_private.enforce_guardian_address_actor_integrity();

create or replace function app_private.enforce_guardian_user_link_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if tg_op='UPDATE' and new.linked_by_user_id is distinct from old.linked_by_user_id then
    raise exception 'Guardian user-link actor provenance is immutable';
  end if;
  if tg_op='INSERT' then
    if new.linked_by_user_id is null then raise exception 'Guardian user-link actor is required'; end if;
    if auth.uid() is not null and new.linked_by_user_id<>auth.uid() then
      raise exception 'Guardian user-link actor must match authenticated actor';
    end if;

    if new.linked_by_user_id=new.user_id then
      if not app_private.user_can_claim_guardian_actor(new.user_id,new.guardian_id) then
        raise exception 'Guardian self-link actor is not verified for guardian';
      end if;
    elsif not app_private.user_can_manage_guardian_actor(new.linked_by_user_id,new.guardian_id) then
      raise exception 'Guardian user-link actor is not authorized for guardian';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_guardian_user_link_actor_integrity()
from public,anon,authenticated;

drop trigger if exists guardian_user_link_submit_actor_integrity_trg on public.guardian_user_links;
create trigger guardian_user_link_submit_actor_integrity_trg
before insert or update of linked_by_user_id on public.guardian_user_links
for each row execute function app_private.enforce_guardian_user_link_actor_integrity();
