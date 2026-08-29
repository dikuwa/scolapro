-- Reusing an existing guardian for another learner must not churn identical contacts or
-- create an invalid same-day history interval. Check the active value before closing a
-- primary contact; when a different primary value is supplied, close the old interval at
-- a date that never precedes its effective_from.

create or replace function public.upsert_guardian_relationship(
  p_learner_id uuid,
  p_guardian_id uuid default null,
  p_first_names text default null,
  p_surname text default null,
  p_preferred_name text default null,
  p_identity_number text default null,
  p_relationship_type text default 'guardian',
  p_is_legal_guardian boolean default false,
  p_is_emergency_contact boolean default false,
  p_is_pickup_authorized boolean default false,
  p_priority smallint default 1,
  p_contacts jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_learner public.learners%rowtype;
  v_guardian public.guardian_profiles%rowtype;
  v_contact jsonb;
  v_type text;
  v_value text;
  v_primary boolean;
  v_same_contact_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_learner from public.learners where id = p_learner_id;
  if not found then raise exception 'Learner not found'; end if;
  if not app_private.can_manage_guardians_for_learner(p_learner_id) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_relationship_type, '')) = '' then raise exception 'Relationship type is required'; end if;
  if p_priority < 1 or p_priority > 20 then raise exception 'Priority must be between 1 and 20'; end if;
  if jsonb_typeof(coalesce(p_contacts, '[]'::jsonb)) <> 'array' then raise exception 'Contacts must be an array'; end if;

  if p_guardian_id is null then
    if btrim(coalesce(p_first_names, '')) = '' or btrim(coalesce(p_surname, '')) = '' then
      raise exception 'Guardian first names and surname are required';
    end if;
    insert into public.guardian_profiles(tenant_id, first_names, surname, preferred_name, identity_number)
    values(
      v_learner.tenant_id,
      btrim(p_first_names),
      btrim(p_surname),
      nullif(btrim(coalesce(p_preferred_name, '')), ''),
      nullif(btrim(coalesce(p_identity_number, '')), '')
    ) returning * into v_guardian;
  else
    select * into v_guardian from public.guardian_profiles where id = p_guardian_id;
    if not found or v_guardian.tenant_id <> v_learner.tenant_id then raise exception 'Guardian not found in learner tenant'; end if;
    update public.guardian_profiles
    set first_names = coalesce(nullif(btrim(coalesce(p_first_names, '')), ''), first_names),
        surname = coalesce(nullif(btrim(coalesce(p_surname, '')), ''), surname),
        preferred_name = case when p_preferred_name is null then preferred_name else nullif(btrim(p_preferred_name), '') end,
        identity_number = case when p_identity_number is null then identity_number else nullif(btrim(p_identity_number), '') end,
        updated_at = now()
    where id = v_guardian.id;
  end if;

  insert into public.learner_guardians(
    tenant_id, learner_id, guardian_id, relationship_type,
    is_legal_guardian, is_emergency_contact, is_pickup_authorized, priority
  ) values (
    v_learner.tenant_id, v_learner.id, v_guardian.id, lower(btrim(p_relationship_type)),
    p_is_legal_guardian, p_is_emergency_contact, p_is_pickup_authorized, p_priority
  )
  on conflict (learner_id, guardian_id, relationship_type) where effective_to is null
  do update set
    is_legal_guardian = excluded.is_legal_guardian,
    is_emergency_contact = excluded.is_emergency_contact,
    is_pickup_authorized = excluded.is_pickup_authorized,
    priority = excluded.priority;

  for v_contact in select value from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb))
  loop
    v_type := lower(btrim(coalesce(v_contact ->> 'type', '')));
    v_value := btrim(coalesce(v_contact ->> 'value', ''));
    v_primary := coalesce((v_contact ->> 'primary')::boolean, false);
    if v_type not in ('email','mobile','phone','whatsapp','address') then raise exception 'Unsupported guardian contact type: %', v_type; end if;
    if v_value = '' then continue; end if;

    select gc.id into v_same_contact_id
    from public.guardian_contacts gc
    where gc.guardian_id = v_guardian.id
      and gc.contact_type = v_type
      and lower(btrim(gc.contact_value)) = lower(v_value)
      and gc.effective_to is null
    order by gc.effective_from desc, gc.created_at desc
    limit 1;

    if v_same_contact_id is not null then
      if v_primary then
        update public.guardian_contacts
        set is_primary = (id = v_same_contact_id)
        where guardian_id = v_guardian.id
          and contact_type = v_type
          and effective_to is null
          and (is_primary = true or id = v_same_contact_id);
      end if;
      v_same_contact_id := null;
      continue;
    end if;

    if v_primary then
      update public.guardian_contacts
      set effective_to = greatest(effective_from, current_date - 1)
      where guardian_id = v_guardian.id
        and contact_type = v_type
        and is_primary = true
        and effective_to is null;
    end if;

    insert into public.guardian_contacts(
      tenant_id, guardian_id, contact_type, label, contact_value, is_primary, created_by_user_id
    ) values (
      v_learner.tenant_id, v_guardian.id, v_type,
      nullif(btrim(coalesce(v_contact ->> 'label', '')), ''), v_value, v_primary, auth.uid()
    );
  end loop;

  insert into public.audit_events(tenant_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values(v_learner.tenant_id, auth.uid(), 'guardian.relationship.upserted', 'learner', v_learner.id,
    jsonb_build_object('guardian_id', v_guardian.id, 'relationship_type', lower(btrim(p_relationship_type))));

  return v_guardian.id;
end;
$$;

revoke all on function public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb) from public,anon;
grant execute on function public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb) to authenticated;

comment on function public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb) is
'Governed many-to-many guardian relationship upsert with retry-safe contact handling and append-oriented contact history.';
