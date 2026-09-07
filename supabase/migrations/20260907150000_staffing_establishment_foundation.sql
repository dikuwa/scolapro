-- N13 staffing establishment / vacancies foundation.
-- Establishment posts are approved requirements, never staff identities. Occupancy
-- references the authoritative effective-dated staff_school_assignments relation;
-- vacancy is derived from occupancy at an as-of date and is never stored.

create table public.staffing_establishment_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  external_identifier text,
  external_identifier_source text,
  supersedes_post_id uuid references public.staffing_establishment_posts(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (external_identifier is null or nullif(btrim(coalesce(external_identifier_source,'')),'') is not null),
  check (supersedes_post_id is null or supersedes_post_id <> id)
);

create index staffing_establishment_posts_school_period_idx
  on public.staffing_establishment_posts(school_id,effective_from,effective_to);
create index staffing_establishment_posts_tenant_idx
  on public.staffing_establishment_posts(tenant_id,school_id);
create index staffing_establishment_posts_supersedes_idx
  on public.staffing_establishment_posts(supersedes_post_id)
  where supersedes_post_id is not null;

create table public.staffing_post_occupancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  post_id uuid not null references public.staffing_establishment_posts(id) on delete restrict,
  staff_school_assignment_id uuid not null references public.staff_school_assignments(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index staffing_post_occupancies_post_period_idx
  on public.staffing_post_occupancies(post_id,effective_from,effective_to);
create index staffing_post_occupancies_assignment_period_idx
  on public.staffing_post_occupancies(staff_school_assignment_id,effective_from,effective_to);
create index staffing_post_occupancies_school_idx
  on public.staffing_post_occupancies(school_id,post_id);

create or replace function app_private.enforce_staffing_establishment_post_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school_tenant uuid;
  v_previous public.staffing_establishment_posts%rowtype;
begin
  select tenant_id into v_school_tenant from public.schools where id=new.school_id;
  if v_school_tenant is null then
    raise exception 'School not found';
  end if;
  if new.tenant_id<>v_school_tenant then
    raise exception 'Staffing establishment tenant must match school tenant';
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.title is distinct from old.title
    or new.external_identifier is distinct from old.external_identifier
    or new.external_identifier_source is distinct from old.external_identifier_source
    or new.supersedes_post_id is distinct from old.supersedes_post_id
    or new.effective_from is distinct from old.effective_from
    or new.created_by_user_id is distinct from old.created_by_user_id
  ) then
    raise exception 'Staffing establishment post provenance is immutable; end it and create a successor';
  end if;

  if new.supersedes_post_id is not null then
    select * into v_previous
    from public.staffing_establishment_posts
    where id=new.supersedes_post_id;
    if not found or v_previous.school_id<>new.school_id or v_previous.tenant_id<>new.tenant_id then
      raise exception 'Superseded staffing post must belong to the same school';
    end if;
    if v_previous.effective_to is null or v_previous.effective_to>=new.effective_from then
      raise exception 'Successor staffing post must begin after the superseded post ends';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_staffing_establishment_post_scope() from public,anon,authenticated;

create trigger staffing_establishment_post_scope_trg
before insert or update on public.staffing_establishment_posts
for each row execute function app_private.enforce_staffing_establishment_post_scope();

create or replace function app_private.enforce_staffing_post_occupancy_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_post public.staffing_establishment_posts%rowtype;
  v_assignment public.staff_school_assignments%rowtype;
begin
  select * into v_post from public.staffing_establishment_posts where id=new.post_id;
  if not found then raise exception 'Staffing establishment post not found'; end if;

  select * into v_assignment from public.staff_school_assignments where id=new.staff_school_assignment_id;
  if not found then raise exception 'Staff school assignment not found'; end if;

  if new.tenant_id<>v_post.tenant_id or new.school_id<>v_post.school_id
     or new.tenant_id<>v_assignment.tenant_id or new.school_id<>v_assignment.school_id then
    raise exception 'Staffing occupancy post and staff placement must belong to the same school and tenant';
  end if;

  if new.effective_from<v_post.effective_from
     or (v_post.effective_to is not null and (new.effective_to is null or new.effective_to>v_post.effective_to)) then
    raise exception 'Staffing occupancy must remain within the approved post period';
  end if;

  if new.effective_from<v_assignment.effective_from
     or (v_assignment.effective_to is not null and (new.effective_to is null or new.effective_to>v_assignment.effective_to)) then
    raise exception 'Staffing occupancy must remain within the authoritative staff placement period';
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.post_id is distinct from old.post_id
    or new.staff_school_assignment_id is distinct from old.staff_school_assignment_id
    or new.effective_from is distinct from old.effective_from
    or new.created_by_user_id is distinct from old.created_by_user_id
  ) then
    raise exception 'Staffing occupancy provenance is immutable; end it and create a new occupancy';
  end if;

  if exists(
    select 1
    from public.staffing_post_occupancies existing
    where existing.post_id=new.post_id
      and existing.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(existing.effective_from,coalesce(existing.effective_to,'infinity'::date),'[]')
          && daterange(new.effective_from,coalesce(new.effective_to,'infinity'::date),'[]')
  ) then
    raise exception 'Staffing establishment post already has an overlapping occupant';
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_staffing_post_occupancy_scope() from public,anon,authenticated;

create trigger staffing_post_occupancy_scope_trg
before insert or update on public.staffing_post_occupancies
for each row execute function app_private.enforce_staffing_post_occupancy_scope();

alter table public.staffing_establishment_posts enable row level security;
alter table public.staffing_post_occupancies enable row level security;

create policy "staffing leadership reads establishment posts"
on public.staffing_establishment_posts for select to authenticated
using (exists(
  select 1 from public.school_memberships sm
  where sm.school_id=staffing_establishment_posts.school_id
    and sm.user_id=(select auth.uid())
    and sm.role_key in ('school_admin','principal','deputy_principal','hod')
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
));

create policy "staffing managers read named occupancies"
on public.staffing_post_occupancies for select to authenticated
using (exists(
  select 1 from public.school_memberships sm
  where sm.school_id=staffing_post_occupancies.school_id
    and sm.user_id=(select auth.uid())
    and sm.role_key in ('school_admin','principal','deputy_principal')
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
));

revoke all on public.staffing_establishment_posts from anon;
revoke all on public.staffing_post_occupancies from anon;
revoke insert,update,delete on public.staffing_establishment_posts from authenticated;
revoke insert,update,delete on public.staffing_post_occupancies from authenticated;
grant select on public.staffing_establishment_posts to authenticated;
grant select on public.staffing_post_occupancies to authenticated;

create or replace function public.create_staffing_establishment_post(
  p_school_id uuid,
  p_title text,
  p_effective_from date,
  p_effective_to date default null,
  p_external_identifier text default null,
  p_external_identifier_source text default null,
  p_supersedes_post_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'Post title is required'; end if;
  if p_effective_from is null then raise exception 'Effective-from date is required'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then
    raise exception 'Effective-to date cannot precede effective-from date';
  end if;
  if nullif(btrim(coalesce(p_external_identifier,'')),'') is not null
     and nullif(btrim(coalesce(p_external_identifier_source,'')),'') is null then
    raise exception 'External identifier source is required when an external identifier is supplied';
  end if;

  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;

  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) then raise exception 'Permission denied'; end if;

  insert into public.staffing_establishment_posts(
    tenant_id,school_id,title,external_identifier,external_identifier_source,
    supersedes_post_id,effective_from,effective_to,created_by_user_id
  ) values(
    v_school.tenant_id,v_school.id,btrim(p_title),nullif(btrim(coalesce(p_external_identifier,'')),''),
    nullif(btrim(coalesce(p_external_identifier_source,'')),''),p_supersedes_post_id,
    p_effective_from,p_effective_to,auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,v_school.id,auth.uid(),'staffing.establishment_post.created','staffing_establishment_post',v_id,
    jsonb_build_object('effective_from',p_effective_from,'effective_to',p_effective_to,'supersedes_post_id',p_supersedes_post_id));

  return v_id;
end;
$$;

create or replace function public.end_staffing_establishment_post(
  p_post_id uuid,
  p_effective_to date default current_date
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_post public.staffing_establishment_posts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_post from public.staffing_establishment_posts where id=p_post_id for update;
  if not found then raise exception 'Staffing establishment post not found'; end if;

  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=v_post.school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) then raise exception 'Permission denied'; end if;

  if p_effective_to is null or p_effective_to<v_post.effective_from then
    raise exception 'Effective-to date cannot precede effective-from date';
  end if;
  if v_post.effective_to is not null and p_effective_to>v_post.effective_to then
    raise exception 'Cannot extend a closed staffing post through the end-post workflow';
  end if;
  if exists(
    select 1 from public.staffing_post_occupancies o
    where o.post_id=v_post.id
      and (o.effective_to is null or o.effective_to>p_effective_to)
  ) then raise exception 'End or shorten staffing occupancies before ending the post'; end if;

  update public.staffing_establishment_posts
  set effective_to=p_effective_to,updated_at=now()
  where id=v_post.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_post.tenant_id,v_post.school_id,auth.uid(),'staffing.establishment_post.ended','staffing_establishment_post',v_post.id,
    jsonb_build_object('effective_to',p_effective_to));
  return true;
end;
$$;

create or replace function public.occupy_staffing_establishment_post(
  p_post_id uuid,
  p_staff_school_assignment_id uuid,
  p_effective_from date,
  p_effective_to date default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_post public.staffing_establishment_posts%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_effective_from is null then raise exception 'Effective-from date is required'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then
    raise exception 'Effective-to date cannot precede effective-from date';
  end if;

  select * into v_post from public.staffing_establishment_posts where id=p_post_id for update;
  if not found then raise exception 'Staffing establishment post not found'; end if;

  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=v_post.school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) then raise exception 'Permission denied'; end if;

  insert into public.staffing_post_occupancies(
    tenant_id,school_id,post_id,staff_school_assignment_id,effective_from,effective_to,created_by_user_id
  ) values(
    v_post.tenant_id,v_post.school_id,v_post.id,p_staff_school_assignment_id,p_effective_from,p_effective_to,auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_post.tenant_id,v_post.school_id,auth.uid(),'staffing.post_occupancy.created','staffing_post_occupancy',v_id,
    jsonb_build_object('post_id',v_post.id,'staff_school_assignment_id',p_staff_school_assignment_id,
      'effective_from',p_effective_from,'effective_to',p_effective_to));

  return v_id;
end;
$$;

create or replace function public.end_staffing_post_occupancy(
  p_occupancy_id uuid,
  p_effective_to date default current_date
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_occupancy public.staffing_post_occupancies%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_occupancy from public.staffing_post_occupancies where id=p_occupancy_id for update;
  if not found then raise exception 'Staffing post occupancy not found'; end if;

  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=v_occupancy.school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) then raise exception 'Permission denied'; end if;

  if p_effective_to is null or p_effective_to<v_occupancy.effective_from then
    raise exception 'Effective-to date cannot precede effective-from date';
  end if;
  if v_occupancy.effective_to is not null and p_effective_to>v_occupancy.effective_to then
    raise exception 'Cannot extend a closed staffing occupancy through the end-occupancy workflow';
  end if;

  update public.staffing_post_occupancies
  set effective_to=p_effective_to,updated_at=now()
  where id=v_occupancy.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_occupancy.tenant_id,v_occupancy.school_id,auth.uid(),'staffing.post_occupancy.ended','staffing_post_occupancy',v_occupancy.id,
    jsonb_build_object('post_id',v_occupancy.post_id,'effective_to',p_effective_to));
  return true;
end;
$$;

create or replace function public.staffing_establishment_as_of(
  p_school_id uuid,
  p_as_of date default current_date
)
returns table(
  post_id uuid,
  title text,
  effective_from date,
  effective_to date,
  external_identifier text,
  external_identifier_source text,
  vacancy_state text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_as_of is null then raise exception 'As-of date is required'; end if;
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal','hod')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) then raise exception 'Permission denied'; end if;

  return query
  select p.id,p.title,p.effective_from,p.effective_to,p.external_identifier,p.external_identifier_source,
    case when exists(
      select 1 from public.staffing_post_occupancies o
      where o.post_id=p.id
        and o.effective_from<=p_as_of
        and (o.effective_to is null or o.effective_to>=p_as_of)
    ) then 'filled'::text else 'vacant'::text end
  from public.staffing_establishment_posts p
  where p.school_id=p_school_id
    and p.effective_from<=p_as_of
    and (p.effective_to is null or p.effective_to>=p_as_of)
  order by p.title,p.id;
end;
$$;

revoke all on function public.create_staffing_establishment_post(uuid,text,date,date,text,text,uuid) from public,anon;
revoke all on function public.end_staffing_establishment_post(uuid,date) from public,anon;
revoke all on function public.occupy_staffing_establishment_post(uuid,uuid,date,date) from public,anon;
revoke all on function public.end_staffing_post_occupancy(uuid,date) from public,anon;
revoke all on function public.staffing_establishment_as_of(uuid,date) from public,anon;
grant execute on function public.create_staffing_establishment_post(uuid,text,date,date,text,text,uuid) to authenticated;
grant execute on function public.end_staffing_establishment_post(uuid,date) to authenticated;
grant execute on function public.occupy_staffing_establishment_post(uuid,uuid,date,date) to authenticated;
grant execute on function public.end_staffing_post_occupancy(uuid,date) to authenticated;
grant execute on function public.staffing_establishment_as_of(uuid,date) to authenticated;

comment on table public.staffing_establishment_posts is
'Approved effective-dated staffing requirements. A row is a post requirement, never a staff identity; revisions are represented by successor rows.';
comment on table public.staffing_post_occupancies is
'Effective-dated linkage between an approved staffing post and the authoritative staff-school placement occupying it.';
comment on function public.staffing_establishment_as_of(uuid,date) is
'School-leadership read model deriving filled/vacant state at an as-of date without exposing occupant identity.';
