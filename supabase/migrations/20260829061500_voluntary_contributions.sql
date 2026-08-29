-- Voluntary school contributions are deliberately separate from compulsory fees.
-- A campaign may request goods, raffle activity or money, but no learner/guardian is
-- treated as owing a debt merely because a voluntary target exists.

create table if not exists public.voluntary_contribution_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year integer not null check (academic_year between 2000 and 2200),
  title text not null,
  description text,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  visible_to_guardians boolean not null default true,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists voluntary_contribution_campaigns_school_idx
  on public.voluntary_contribution_campaigns(school_id,academic_year,status,starts_on desc);

create table if not exists public.voluntary_contribution_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  campaign_id uuid not null references public.voluntary_contribution_campaigns(id) on delete cascade,
  item_type text not null check (item_type in ('goods','money','raffle','service','other')),
  label text not null,
  description text,
  unit_label text,
  suggested_quantity numeric(12,2),
  suggested_amount numeric(12,2),
  currency text default 'NAD',
  required_for_all boolean not null default false,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (suggested_quantity is null or suggested_quantity >= 0),
  check (suggested_amount is null or suggested_amount >= 0),
  check (not required_for_all)
);
create index if not exists voluntary_contribution_items_campaign_idx
  on public.voluntary_contribution_items(campaign_id,active,sort_order);

create table if not exists public.learner_voluntary_contributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  campaign_id uuid not null references public.voluntary_contribution_campaigns(id) on delete cascade,
  item_id uuid not null references public.voluntary_contribution_items(id) on delete restrict,
  contribution_date date not null default current_date,
  quantity numeric(12,2),
  amount numeric(12,2),
  note text,
  received_by_staff_member_id uuid references public.staff_members(id) on delete restrict,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  source text not null default 'school_recorded' check (source in ('school_recorded','guardian_declared')),
  status text not null default 'recorded' check (status in ('recorded','verified','reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity is null or quantity >= 0),
  check (amount is null or amount >= 0),
  check (quantity is not null or amount is not null or note is not null)
);
create index if not exists learner_voluntary_contributions_learner_idx
  on public.learner_voluntary_contributions(learner_id,contribution_date desc);
create index if not exists learner_voluntary_contributions_campaign_idx
  on public.learner_voluntary_contributions(campaign_id,item_id,status);

alter table public.voluntary_contribution_campaigns enable row level security;
alter table public.voluntary_contribution_items enable row level security;
alter table public.learner_voluntary_contributions enable row level security;

create or replace function app_private.can_manage_voluntary_contributions(p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,app_private as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','class_teacher']);
$$;
revoke all on function app_private.can_manage_voluntary_contributions(uuid) from public,anon,authenticated;

create policy "authorized staff read contribution campaigns" on public.voluntary_contribution_campaigns
for select to authenticated using (app_private.has_school_access(school_id));
create policy "authorized staff read contribution items" on public.voluntary_contribution_items
for select to authenticated using (app_private.has_school_access(school_id));
create policy "authorized staff read learner contributions" on public.learner_voluntary_contributions
for select to authenticated using (app_private.can_view_operational_learners(school_id));

revoke all on public.voluntary_contribution_campaigns,public.voluntary_contribution_items,public.learner_voluntary_contributions from anon,authenticated;
grant select on public.voluntary_contribution_campaigns,public.voluntary_contribution_items,public.learner_voluntary_contributions to authenticated;

create or replace function public.create_voluntary_contribution_campaign(
  p_school_id uuid,
  p_academic_year integer,
  p_title text,
  p_description text default null,
  p_starts_on date default current_date,
  p_ends_on date default null,
  p_visible_to_guardians boolean default true
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare v_school public.schools%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'Campaign title is required'; end if;
  if p_ends_on is not null and p_ends_on<p_starts_on then raise exception 'Campaign end cannot precede start'; end if;
  insert into public.voluntary_contribution_campaigns(tenant_id,school_id,academic_year,title,description,starts_on,ends_on,visible_to_guardians,created_by_user_id)
  values(v_school.tenant_id,v_school.id,p_academic_year,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),p_starts_on,p_ends_on,p_visible_to_guardians,auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.add_voluntary_contribution_item(
  p_campaign_id uuid,
  p_item_type text,
  p_label text,
  p_description text default null,
  p_unit_label text default null,
  p_suggested_quantity numeric default null,
  p_suggested_amount numeric default null,
  p_sort_order integer default 100
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare v_campaign public.voluntary_contribution_campaigns%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_campaign from public.voluntary_contribution_campaigns where id=p_campaign_id;
  if not found then raise exception 'Contribution campaign not found'; end if;
  if not app_private.has_school_role(v_campaign.school_id,array['school_admin','principal','deputy_principal']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if p_item_type not in ('goods','money','raffle','service','other') then raise exception 'Unsupported contribution item type'; end if;
  if btrim(coalesce(p_label,''))='' then raise exception 'Contribution item label is required'; end if;
  insert into public.voluntary_contribution_items(tenant_id,school_id,campaign_id,item_type,label,description,unit_label,suggested_quantity,suggested_amount,sort_order)
  values(v_campaign.tenant_id,v_campaign.school_id,v_campaign.id,p_item_type,btrim(p_label),nullif(btrim(coalesce(p_description,'')),''),nullif(btrim(coalesce(p_unit_label,'')),''),p_suggested_quantity,p_suggested_amount,p_sort_order) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.publish_voluntary_contribution_campaign(p_campaign_id uuid)
returns boolean
language plpgsql security definer set search_path=public,app_private as $$
declare v_campaign public.voluntary_contribution_campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_campaign from public.voluntary_contribution_campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Contribution campaign not found'; end if;
  if not app_private.has_school_role(v_campaign.school_id,array['school_admin','principal','deputy_principal']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.voluntary_contribution_items where campaign_id=v_campaign.id and active=true) then raise exception 'Add at least one contribution item before publishing'; end if;
  update public.voluntary_contribution_campaigns set status='published',updated_at=now() where id=v_campaign.id;
  return true;
end; $$;

create or replace function public.record_learner_voluntary_contribution(
  p_learner_id uuid,
  p_item_id uuid,
  p_contribution_date date default current_date,
  p_quantity numeric default null,
  p_amount numeric default null,
  p_note text default null,
  p_received_by_staff_member_id uuid default null
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare v_item public.voluntary_contribution_items%rowtype; v_enrol public.enrolments%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_item from public.voluntary_contribution_items where id=p_item_id and active=true;
  if not found then raise exception 'Contribution item not found'; end if;
  if not app_private.can_manage_voluntary_contributions(v_item.school_id) then raise exception 'Permission denied'; end if;
  select * into v_enrol from public.enrolments where learner_id=p_learner_id and school_id=v_item.school_id and status='current' order by academic_year desc limit 1;
  if not found then raise exception 'Learner is not currently enrolled in this school'; end if;
  if p_received_by_staff_member_id is not null and not exists(select 1 from public.staff_school_assignments ssa where ssa.school_id=v_item.school_id and ssa.staff_member_id=p_received_by_staff_member_id and ssa.effective_from<=p_contribution_date and (ssa.effective_to is null or ssa.effective_to>=p_contribution_date)) then raise exception 'Receiving staff member is not actively assigned to this school'; end if;
  insert into public.learner_voluntary_contributions(tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,quantity,amount,note,received_by_staff_member_id,recorded_by_user_id)
  values(v_item.tenant_id,v_item.school_id,p_learner_id,v_enrol.id,v_item.campaign_id,v_item.id,p_contribution_date,p_quantity,p_amount,nullif(btrim(coalesce(p_note,'')),''),p_received_by_staff_member_id,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_item.tenant_id,v_item.school_id,auth.uid(),'voluntary_contribution.recorded','learner',p_learner_id,jsonb_build_object('contribution_id',v_id,'item_id',v_item.id,'campaign_id',v_item.campaign_id));
  return v_id;
end; $$;

create or replace function public.get_my_children_voluntary_contributions()
returns table(
  learner_id uuid, campaign_id uuid, campaign_title text, campaign_description text,
  item_id uuid, item_type text, item_label text, unit_label text,
  suggested_quantity numeric, suggested_amount numeric, contribution_id uuid,
  contribution_date date, contributed_quantity numeric, contributed_amount numeric,
  contribution_note text, contribution_status text
)
language sql stable security definer set search_path=public,app_private as $$
  select lg.learner_id,c.id,c.title,c.description,i.id,i.item_type,i.label,i.unit_label,
         i.suggested_quantity,i.suggested_amount,r.id,r.contribution_date,r.quantity,r.amount,r.note,r.status
  from public.guardian_user_links gul
  join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
    and lg.effective_from<=current_date and (lg.effective_to is null or lg.effective_to>=current_date)
  join public.enrolments e on e.learner_id=lg.learner_id and e.status='current'
  join public.voluntary_contribution_campaigns c on c.school_id=e.school_id and c.academic_year=e.academic_year and c.status='published' and c.visible_to_guardians=true and c.starts_on<=current_date and (c.ends_on is null or c.ends_on>=current_date)
  join public.voluntary_contribution_items i on i.campaign_id=c.id and i.active=true
  left join public.learner_voluntary_contributions r on r.learner_id=lg.learner_id and r.item_id=i.id and r.status<>'reversed'
  where gul.user_id=auth.uid()
  order by lg.learner_id,c.starts_on desc,i.sort_order,r.contribution_date desc;
$$;

revoke all on function public.create_voluntary_contribution_campaign(uuid,integer,text,text,date,date,boolean) from public,anon;
grant execute on function public.create_voluntary_contribution_campaign(uuid,integer,text,text,date,date,boolean) to authenticated;
revoke all on function public.add_voluntary_contribution_item(uuid,text,text,text,text,numeric,numeric,integer) from public,anon;
grant execute on function public.add_voluntary_contribution_item(uuid,text,text,text,text,numeric,numeric,integer) to authenticated;
revoke all on function public.publish_voluntary_contribution_campaign(uuid) from public,anon;
grant execute on function public.publish_voluntary_contribution_campaign(uuid) to authenticated;
revoke all on function public.record_learner_voluntary_contribution(uuid,uuid,date,numeric,numeric,text,uuid) from public,anon;
grant execute on function public.record_learner_voluntary_contribution(uuid,uuid,date,numeric,numeric,text,uuid) to authenticated;
revoke all on function public.get_my_children_voluntary_contributions() from public,anon;
grant execute on function public.get_my_children_voluntary_contributions() to authenticated;
