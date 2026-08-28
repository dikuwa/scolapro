-- Guardian/parent relationship and effective-dated contact foundation.
-- Guardians are independent people records so one parent can link to multiple siblings.

create table public.guardian_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  first_names text not null check (btrim(first_names) <> ''),
  surname text not null check (btrim(surname) <> ''),
  preferred_name text,
  identity_number text,
  status text not null default 'active' check (status in ('active','inactive','deceased')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index guardian_profiles_tenant_identity_uidx
  on public.guardian_profiles (tenant_id, lower(btrim(identity_number)))
  where identity_number is not null and btrim(identity_number) <> '';
create index guardian_profiles_tenant_name_idx on public.guardian_profiles (tenant_id, surname, first_names);

create table public.learner_guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  guardian_id uuid not null references public.guardian_profiles(id) on delete cascade,
  relationship_type text not null default 'guardian',
  is_legal_guardian boolean not null default false,
  is_emergency_contact boolean not null default false,
  is_pickup_authorized boolean not null default false,
  priority smallint not null default 1 check (priority between 1 and 20),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index learner_guardians_active_relationship_uidx
  on public.learner_guardians (learner_id, guardian_id, relationship_type)
  where effective_to is null;
create index learner_guardians_guardian_idx on public.learner_guardians (guardian_id, learner_id);
create index learner_guardians_learner_idx on public.learner_guardians (learner_id, priority);

create table public.guardian_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guardian_id uuid not null references public.guardian_profiles(id) on delete cascade,
  contact_type text not null check (contact_type in ('email','mobile','phone','whatsapp','address')),
  label text,
  contact_value text not null check (btrim(contact_value) <> ''),
  is_primary boolean not null default false,
  verified_at timestamptz,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create index guardian_contacts_guardian_active_idx on public.guardian_contacts (guardian_id, contact_type, is_primary) where effective_to is null;
create unique index guardian_contacts_one_primary_type_uidx
  on public.guardian_contacts (guardian_id, contact_type)
  where is_primary = true and effective_to is null;

create table public.guardian_user_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guardian_id uuid not null references public.guardian_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_by_user_id uuid references auth.users(id) on delete set null,
  unique (guardian_id, user_id),
  unique (tenant_id, user_id)
);
create index guardian_user_links_user_idx on public.guardian_user_links (user_id, guardian_id);

create or replace function app_private.can_manage_guardians_for_learner(p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists (
    select 1
    from public.enrolments e
    where e.learner_id = p_learner_id
      and (e.enrolled_to is null or e.enrolled_to >= current_date)
      and app_private.has_school_role(e.school_id, array['school_admin','principal','deputy_principal','counsellor','class_teacher'])
  ) or app_private.has_platform_role(array['platform_admin']);
$$;

create or replace function app_private.can_read_guardian(p_guardian_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists (
    select 1
    from public.guardian_user_links gul
    where gul.guardian_id = p_guardian_id and gul.user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.learner_guardians lg
    join public.enrolments e on e.learner_id = lg.learner_id
    where lg.guardian_id = p_guardian_id
      and lg.effective_from <= current_date
      and (lg.effective_to is null or lg.effective_to >= current_date)
      and app_private.has_school_role(e.school_id, array['school_admin','principal','deputy_principal','hod','counsellor','class_teacher'])
  ) or app_private.has_platform_role(array['platform_admin']);
$$;

alter table public.guardian_profiles enable row level security;
alter table public.learner_guardians enable row level security;
alter table public.guardian_contacts enable row level security;
alter table public.guardian_user_links enable row level security;

create policy "authorized users read guardians" on public.guardian_profiles
for select to authenticated using (app_private.can_read_guardian(id));

create policy "school leaders manage guardians" on public.guardian_profiles
for all to authenticated
using (app_private.has_platform_role(array['platform_admin']) or exists (
  select 1 from public.learner_guardians lg where lg.guardian_id = guardian_profiles.id and app_private.can_manage_guardians_for_learner(lg.learner_id)
))
with check (app_private.has_platform_role(array['platform_admin']) or exists (
  select 1 from public.schools s where s.tenant_id = guardian_profiles.tenant_id and app_private.has_school_role(s.id, array['school_admin','principal','deputy_principal','counsellor'])
));

create policy "authorized users read learner guardian links" on public.learner_guardians
for select to authenticated using (
  app_private.can_manage_guardians_for_learner(learner_id)
  or exists (select 1 from public.guardian_user_links gul where gul.guardian_id = learner_guardians.guardian_id and gul.user_id = (select auth.uid()))
);
create policy "authorized staff manage learner guardian links" on public.learner_guardians
for all to authenticated using (app_private.can_manage_guardians_for_learner(learner_id))
with check (app_private.can_manage_guardians_for_learner(learner_id));

create policy "authorized users read guardian contacts" on public.guardian_contacts
for select to authenticated using (app_private.can_read_guardian(guardian_id));
create policy "authorized staff manage guardian contacts" on public.guardian_contacts
for all to authenticated
using (exists (select 1 from public.learner_guardians lg where lg.guardian_id = guardian_contacts.guardian_id and app_private.can_manage_guardians_for_learner(lg.learner_id)) or app_private.has_platform_role(array['platform_admin']))
with check (exists (select 1 from public.learner_guardians lg where lg.guardian_id = guardian_contacts.guardian_id and app_private.can_manage_guardians_for_learner(lg.learner_id)) or app_private.has_platform_role(array['platform_admin']));

create policy "guardians read their user links" on public.guardian_user_links
for select to authenticated using (user_id = (select auth.uid()) or app_private.can_read_guardian(guardian_id));
create policy "authorized staff manage guardian user links" on public.guardian_user_links
for all to authenticated
using (exists (select 1 from public.learner_guardians lg where lg.guardian_id = guardian_user_links.guardian_id and app_private.can_manage_guardians_for_learner(lg.learner_id)) or app_private.has_platform_role(array['platform_admin']))
with check (exists (select 1 from public.learner_guardians lg where lg.guardian_id = guardian_user_links.guardian_id and app_private.can_manage_guardians_for_learner(lg.learner_id)) or app_private.has_platform_role(array['platform_admin']));

revoke all on public.guardian_profiles, public.learner_guardians, public.guardian_contacts, public.guardian_user_links from anon;
grant select, insert, update, delete on public.guardian_profiles, public.learner_guardians, public.guardian_contacts, public.guardian_user_links to authenticated;
