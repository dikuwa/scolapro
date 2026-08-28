-- Structured guardian addresses and governed multi-contact maintenance.
-- Contacts remain effective-dated; addresses are separate so report cards can render
-- postal/physical addresses without parsing a free-text contact field.

create table public.guardian_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guardian_id uuid not null references public.guardian_profiles(id) on delete cascade,
  address_type text not null default 'physical' check (address_type in ('physical','postal','work','other')),
  label text,
  address_line_1 text not null,
  address_line_2 text,
  suburb_or_locality text,
  town_or_city text,
  region text,
  postal_code text,
  country text not null default 'Namibia',
  is_primary boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create index guardian_addresses_guardian_current_idx on public.guardian_addresses(guardian_id, address_type, is_primary) where effective_to is null;
create unique index guardian_addresses_one_primary_type_idx on public.guardian_addresses(guardian_id, address_type) where is_primary = true and effective_to is null;

alter table public.guardian_addresses enable row level security;

create policy "authorized school members read guardian addresses" on public.guardian_addresses
for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or exists (
    select 1 from public.learner_guardians lg
    join public.enrolments e on e.learner_id = lg.learner_id and e.status = 'current'
    where lg.guardian_id = guardian_addresses.guardian_id
      and lg.effective_to is null
      and app_private.has_school_role(e.school_id, array['school_admin','principal','deputy_principal','class_teacher'])
  )
  or exists (
    select 1 from public.guardian_user_links gul
    where gul.guardian_id = guardian_addresses.guardian_id
      and gul.user_id = (select auth.uid())
  )
);

create policy "guardian managers insert addresses" on public.guardian_addresses
for insert to authenticated
with check (
  exists (
    select 1 from public.learner_guardians lg
    where lg.guardian_id = guardian_addresses.guardian_id
      and lg.effective_to is null
      and app_private.can_manage_guardians_for_learner(lg.learner_id)
  )
);

create policy "guardian managers update addresses" on public.guardian_addresses
for update to authenticated
using (
  exists (
    select 1 from public.learner_guardians lg
    where lg.guardian_id = guardian_addresses.guardian_id
      and lg.effective_to is null
      and app_private.can_manage_guardians_for_learner(lg.learner_id)
  )
)
with check (
  exists (
    select 1 from public.learner_guardians lg
    where lg.guardian_id = guardian_addresses.guardian_id
      and lg.effective_to is null
      and app_private.can_manage_guardians_for_learner(lg.learner_id)
  )
);

revoke all on public.guardian_addresses from anon;
grant select, insert, update on public.guardian_addresses to authenticated;

create or replace function public.replace_guardian_contact_details(
  p_guardian_id uuid,
  p_learner_id uuid,
  p_contacts jsonb default '[]'::jsonb,
  p_addresses jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app_private
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
  if not found or v_guardian.tenant_id <> v_learner.tenant_id then raise exception 'Guardian not found in learner tenant'; end if;
  if not exists(select 1 from public.learner_guardians where learner_id=p_learner_id and guardian_id=p_guardian_id and effective_to is null) then raise exception 'Guardian is not linked to this learner'; end if;
  if jsonb_typeof(coalesce(p_contacts,'[]'::jsonb)) <> 'array' then raise exception 'Contacts must be an array'; end if;
  if jsonb_typeof(coalesce(p_addresses,'[]'::jsonb)) <> 'array' then raise exception 'Addresses must be an array'; end if;

  update public.guardian_contacts set effective_to=current_date where guardian_id=p_guardian_id and effective_to is null;
  for v_item in select value from jsonb_array_elements(coalesce(p_contacts,'[]'::jsonb)) loop
    v_type := lower(btrim(coalesce(v_item->>'type','')));
    v_value := btrim(coalesce(v_item->>'value',''));
    v_label := nullif(btrim(coalesce(v_item->>'label','')), '');
    v_primary := coalesce((v_item->>'primary')::boolean,false);
    if v_value='' then continue; end if;
    if v_type not in ('email','mobile','phone','whatsapp') then raise exception 'Unsupported guardian contact type: %',v_type; end if;
    if v_primary then update public.guardian_contacts set is_primary=false where guardian_id=p_guardian_id and contact_type=v_type and effective_to is null; end if;
    insert into public.guardian_contacts(tenant_id,guardian_id,contact_type,label,contact_value,is_primary,created_by_user_id)
    values(v_learner.tenant_id,p_guardian_id,v_type,v_label,v_value,v_primary,auth.uid());
  end loop;

  update public.guardian_addresses set effective_to=current_date where guardian_id=p_guardian_id and effective_to is null;
  for v_item in select value from jsonb_array_elements(coalesce(p_addresses,'[]'::jsonb)) loop
    v_type := lower(btrim(coalesce(v_item->>'type','physical')));
    v_line1 := btrim(coalesce(v_item->>'line1',''));
    v_primary := coalesce((v_item->>'primary')::boolean,false);
    if v_line1='' then continue; end if;
    if v_type not in ('physical','postal','work','other') then raise exception 'Unsupported guardian address type: %',v_type; end if;
    if v_primary then update public.guardian_addresses set is_primary=false where guardian_id=p_guardian_id and address_type=v_type and effective_to is null; end if;
    insert into public.guardian_addresses(tenant_id,guardian_id,address_type,label,address_line_1,address_line_2,suburb_or_locality,town_or_city,region,postal_code,country,is_primary,created_by_user_id)
    values(v_learner.tenant_id,p_guardian_id,v_type,nullif(btrim(coalesce(v_item->>'label','')),''),v_line1,nullif(btrim(coalesce(v_item->>'line2','')),''),nullif(btrim(coalesce(v_item->>'locality','')),''),nullif(btrim(coalesce(v_item->>'town','')),''),nullif(btrim(coalesce(v_item->>'region','')),''),nullif(btrim(coalesce(v_item->>'postalCode','')),''),coalesce(nullif(btrim(coalesce(v_item->>'country','')),''),'Namibia'),v_primary,auth.uid());
  end loop;

  insert into public.audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_learner.tenant_id,auth.uid(),'guardian.contact_details.replaced','guardian',p_guardian_id,jsonb_build_object('learner_id',p_learner_id,'contacts',jsonb_array_length(coalesce(p_contacts,'[]'::jsonb)),'addresses',jsonb_array_length(coalesce(p_addresses,'[]'::jsonb))));
end;
$$;

revoke all on function public.replace_guardian_contact_details(uuid,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.replace_guardian_contact_details(uuid,uuid,jsonb,jsonb) to authenticated;
