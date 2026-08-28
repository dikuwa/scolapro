-- Guardian reuse and parent-account claim workflow.
-- Existing guardian identities are linked across siblings instead of duplicated.

create or replace function public.link_existing_guardian_to_learner(
  p_learner_id uuid,
  p_guardian_id uuid,
  p_relationship_type text,
  p_is_legal_guardian boolean default false,
  p_is_emergency_contact boolean default false,
  p_is_pickup_authorized boolean default false,
  p_priority smallint default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_learner public.learners%rowtype;
  v_guardian public.guardian_profiles%rowtype;
  v_school_id uuid;
  v_relationship_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_guardians_for_learner(p_learner_id) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_relationship_type, '')) = '' then raise exception 'Relationship type is required'; end if;
  if p_priority < 1 or p_priority > 20 then raise exception 'Priority must be between 1 and 20'; end if;

  select * into v_learner from public.learners where id = p_learner_id;
  if not found then raise exception 'Learner not found'; end if;
  select * into v_guardian from public.guardian_profiles where id = p_guardian_id and status = 'active';
  if not found then raise exception 'Guardian not found or inactive'; end if;
  if v_guardian.tenant_id <> v_learner.tenant_id then raise exception 'Guardian and learner must belong to the same tenant'; end if;

  select e.school_id into v_school_id
  from public.enrolments e
  where e.learner_id = p_learner_id
    and (e.enrolled_to is null or e.enrolled_to >= current_date)
  order by e.enrolled_from desc
  limit 1;

  select id into v_relationship_id
  from public.learner_guardians
  where learner_id = p_learner_id
    and guardian_id = p_guardian_id
    and relationship_type = lower(btrim(p_relationship_type))
    and effective_to is null
  limit 1;

  if v_relationship_id is null then
    insert into public.learner_guardians (
      tenant_id, learner_id, guardian_id, relationship_type,
      is_legal_guardian, is_emergency_contact, is_pickup_authorized, priority
    ) values (
      v_learner.tenant_id, p_learner_id, p_guardian_id, lower(btrim(p_relationship_type)),
      p_is_legal_guardian, p_is_emergency_contact, p_is_pickup_authorized, p_priority
    ) returning id into v_relationship_id;
  else
    update public.learner_guardians
    set is_legal_guardian = p_is_legal_guardian,
        is_emergency_contact = p_is_emergency_contact,
        is_pickup_authorized = p_is_pickup_authorized,
        priority = p_priority
    where id = v_relationship_id;
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_learner.tenant_id, v_school_id, auth.uid(), 'guardian.relationship.linked_existing',
    'learner_guardian', v_relationship_id,
    jsonb_build_object('learner_id', p_learner_id, 'guardian_id', p_guardian_id, 'relationship_type', lower(btrim(p_relationship_type)))
  );

  return v_relationship_id;
end;
$$;

create or replace function public.claim_guardian_profile(p_guardian_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_guardian public.guardian_profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id = v_user_id;
  if v_email is null or btrim(v_email) = '' then raise exception 'Authenticated account has no email'; end if;

  select * into v_guardian from public.guardian_profiles where id = p_guardian_id and status = 'active';
  if not found then raise exception 'Guardian not found or inactive'; end if;

  if not exists (
    select 1 from public.guardian_contacts gc
    where gc.guardian_id = p_guardian_id
      and gc.contact_type = 'email'
      and gc.effective_to is null
      and lower(btrim(gc.contact_value)) = v_email
  ) then
    raise exception 'Account email does not match an active guardian email';
  end if;

  insert into public.guardian_user_links (tenant_id, guardian_id, user_id, linked_by_user_id)
  values (v_guardian.tenant_id, p_guardian_id, v_user_id, v_user_id)
  on conflict (guardian_id, user_id) do nothing;

  insert into public.audit_events (tenant_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_guardian.tenant_id, v_user_id, 'guardian.portal.claimed', 'guardian_profile', p_guardian_id, jsonb_build_object('email', v_email));

  return true;
end;
$$;

revoke all on function public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint) from public, anon;
grant execute on function public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint) to authenticated;
revoke all on function public.claim_guardian_profile(uuid) from public, anon;
grant execute on function public.claim_guardian_profile(uuid) to authenticated;

comment on function public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint) is 'Links one existing tenant guardian identity to another learner/sibling without duplicating the guardian profile.';
comment on function public.claim_guardian_profile(uuid) is 'Allows an authenticated parent/guardian account to claim a guardian profile only when its authenticated email matches an active guardian email contact.';
