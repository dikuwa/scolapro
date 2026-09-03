-- Replacing guardian contact details must retire currently effective rows
-- immediately without touching future-scheduled contact/address rows.
--
-- Effective periods are stored as inclusive dates. Setting effective_to to
-- current_date therefore leaves an old email/address effective for the rest of
-- today. That is especially unsafe for guardian email because account claim
-- eligibility also uses inclusive current-period semantics. For rows that
-- started before today we close the range at yesterday. Rows created earlier
-- today and superseded again today cannot be closed at yesterday without
-- violating effective_to >= effective_from, so those transient same-day rows
-- are removed before the replacement is inserted. Future-scheduled rows remain
-- untouched.

create or replace function public.replace_guardian_contact_details(
  p_guardian_id uuid,
  p_learner_id uuid,
  p_contacts jsonb default '[]'::jsonb,
  p_addresses jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_guardian public.guardian_profiles%rowtype;
  v_learner public.learners%rowtype;
  v_item jsonb;
  v_type text;
  v_value text;
  v_label text;
  v_primary boolean;
  v_line1 text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_guardians_for_learner(p_learner_id) then raise exception 'Permission denied'; end if;

  select * into v_learner from public.learners where id=p_learner_id;
  if not found then raise exception 'Learner not found'; end if;

  select * into v_guardian from public.guardian_profiles where id=p_guardian_id;
  if not found or v_guardian.tenant_id<>v_learner.tenant_id then
    raise exception 'Guardian not found in learner tenant';
  end if;

  if not exists(
    select 1
    from public.learner_guardians
    where learner_id=p_learner_id
      and guardian_id=p_guardian_id
      and effective_from<=current_date
      and (effective_to is null or effective_to>=current_date)
  ) then
    raise exception 'Guardian is not linked to this learner';
  end if;

  if jsonb_typeof(coalesce(p_contacts,'[]'::jsonb))<>'array' then raise exception 'Contacts must be an array'; end if;
  if jsonb_typeof(coalesce(p_addresses,'[]'::jsonb))<>'array' then raise exception 'Addresses must be an array'; end if;

  -- Superseded rows created today cannot be represented as an immediately
  -- closed inclusive date range, so remove those transient same-day rows.
  delete from public.guardian_contacts
  where guardian_id=p_guardian_id
    and effective_from=current_date
    and (effective_to is null or effective_to>=current_date);

  -- Older currently effective rows retain history but stop being effective
  -- immediately. Future-scheduled rows are deliberately excluded.
  update public.guardian_contacts
  set effective_to=current_date-1
  where guardian_id=p_guardian_id
    and effective_from<current_date
    and (effective_to is null or effective_to>=current_date);

  for v_item in select value from jsonb_array_elements(coalesce(p_contacts,'[]'::jsonb)) loop
    v_type:=lower(btrim(coalesce(v_item->>'type','')));
    v_value:=btrim(coalesce(v_item->>'value',''));
    v_label:=nullif(btrim(coalesce(v_item->>'label','')),'');
    v_primary:=coalesce((v_item->>'primary')::boolean,false);
    if v_value='' then continue; end if;
    if v_type not in ('email','mobile','phone','whatsapp') then
      raise exception 'Unsupported guardian contact type: %',v_type;
    end if;
    if v_primary then
      update public.guardian_contacts
      set is_primary=false
      where guardian_id=p_guardian_id
        and contact_type=v_type
        and effective_from<=current_date
        and (effective_to is null or effective_to>=current_date);
    end if;
    insert into public.guardian_contacts(
      tenant_id,guardian_id,contact_type,label,contact_value,is_primary,created_by_user_id
    ) values(
      v_learner.tenant_id,p_guardian_id,v_type,v_label,v_value,v_primary,auth.uid()
    );
  end loop;

  delete from public.guardian_addresses
  where guardian_id=p_guardian_id
    and effective_from=current_date
    and (effective_to is null or effective_to>=current_date);

  update public.guardian_addresses
  set effective_to=current_date-1
  where guardian_id=p_guardian_id
    and effective_from<current_date
    and (effective_to is null or effective_to>=current_date);

  for v_item in select value from jsonb_array_elements(coalesce(p_addresses,'[]'::jsonb)) loop
    v_type:=lower(btrim(coalesce(v_item->>'type','physical')));
    v_line1:=btrim(coalesce(v_item->>'line1',''));
    v_primary:=coalesce((v_item->>'primary')::boolean,false);
    if v_line1='' then continue; end if;
    if v_type not in ('physical','postal','work','other') then
      raise exception 'Unsupported guardian address type: %',v_type;
    end if;
    if v_primary then
      update public.guardian_addresses
      set is_primary=false
      where guardian_id=p_guardian_id
        and address_type=v_type
        and effective_from<=current_date
        and (effective_to is null or effective_to>=current_date);
    end if;
    insert into public.guardian_addresses(
      tenant_id,guardian_id,address_type,label,address_line_1,address_line_2,
      suburb_or_locality,town_or_city,region,postal_code,country,is_primary,created_by_user_id
    ) values(
      v_learner.tenant_id,p_guardian_id,v_type,
      nullif(btrim(coalesce(v_item->>'label','')),''),v_line1,
      nullif(btrim(coalesce(v_item->>'line2','')),''),
      nullif(btrim(coalesce(v_item->>'locality','')),''),
      nullif(btrim(coalesce(v_item->>'town','')),''),
      nullif(btrim(coalesce(v_item->>'region','')),''),
      nullif(btrim(coalesce(v_item->>'postalCode','')),''),
      coalesce(nullif(btrim(coalesce(v_item->>'country','')),''),'Namibia'),
      v_primary,auth.uid()
    );
  end loop;

  insert into public.audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_learner.tenant_id,auth.uid(),'guardian.contact_details.replaced','guardian',p_guardian_id,
    jsonb_build_object(
      'learner_id',p_learner_id,
      'contacts',jsonb_array_length(coalesce(p_contacts,'[]'::jsonb)),
      'addresses',jsonb_array_length(coalesce(p_addresses,'[]'::jsonb))
    )
  );
end;
$$;

revoke all on function public.replace_guardian_contact_details(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.replace_guardian_contact_details(uuid,uuid,jsonb,jsonb) to authenticated;

comment on function public.replace_guardian_contact_details(uuid,uuid,jsonb,jsonb) is
'Replaces guardian contact/address details effective immediately, preserving historical periods, leaving future schedules untouched, and preventing superseded emails from remaining claimable on the replacement date.';