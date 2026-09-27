-- Conduct Policy Slice 1: configurable Recognition / Violation groups.
-- Extends the existing conduct policy; does not replace conduct/achievement history.

create table public.conduct_policy_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  school_id uuid not null references public.schools(id),
  type text not null check (type in ('recognition','violation')),
  code text not null check (length(btrim(code)) between 1 and 40),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  default_points integer,
  default_severity text check (default_severity in ('routine','moderate','serious','critical')),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,type,code)
);

create index conduct_policy_groups_scope_idx
on public.conduct_policy_groups(school_id,type,active,sort_order,display_name);
create index conduct_policy_groups_tenant_idx
on public.conduct_policy_groups(tenant_id);

alter table public.conduct_policy_groups enable row level security;
revoke all on public.conduct_policy_groups from anon,authenticated;
grant select on public.conduct_policy_groups to authenticated;

create policy "current school staff read conduct policy groups"
on public.conduct_policy_groups for select to authenticated
using (
  school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id=(select auth.uid())
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
    order by sm.active_from desc,sm.id asc
    limit 1
  )
  and app_private.can_view_operational_learners(school_id)
);

create trigger conduct_policy_group_school_scope
before insert or update on public.conduct_policy_groups
for each row execute function app_private.enforce_school_scoped_root_integrity();

alter table public.conduct_policy_categories
  add column group_id uuid references public.conduct_policy_groups(id) on delete restrict,
  add column requires_management_attention boolean not null default false;

create index conduct_policy_categories_group_idx
on public.conduct_policy_categories(school_id,group_id,active,sort_order);

create or replace function app_private.conduct_policy_type_for_category(
  p_domain text,
  p_direction text
)
returns text
language sql
immutable
set search_path=pg_catalog
as $$
  select case
    when p_domain='achievement' then 'recognition'
    when p_domain='conduct' and p_direction='positive' then 'recognition'
    when p_domain='conduct' and p_direction='negative' then 'violation'
    else null
  end;
$$;
revoke all on function app_private.conduct_policy_type_for_category(text,text)
from public,anon,authenticated;

create or replace function app_private.ensure_conduct_category_group()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_type text;
  v_group public.conduct_policy_groups%rowtype;
  v_code text;
begin
  v_type:=app_private.conduct_policy_type_for_category(new.domain,new.direction);
  if v_type is null then
    raise exception 'Category type is invalid';
  end if;

  if new.group_id is null then
    select g.* into v_group
    from public.conduct_policy_groups g
    where g.school_id=new.school_id
      and g.tenant_id=new.tenant_id
      and g.type=v_type
    order by g.active desc,g.sort_order,g.created_at,g.id
    limit 1;

    if not found then
      v_code:=case when v_type='recognition' then 'AUTO_RECOGNITION' else 'AUTO_VIOLATION' end;
      insert into public.conduct_policy_groups(
        tenant_id,school_id,type,code,display_name,default_points,default_severity,sort_order,active
      ) values (
        new.tenant_id,new.school_id,v_type,v_code,
        case when v_type='recognition' then 'Recognition' else 'Violations' end,
        new.points,
        case when v_type='violation' then coalesce(new.default_severity,'routine') else null end,
        100,true
      )
      on conflict (school_id,type,code) do nothing;

      select g.* into v_group
      from public.conduct_policy_groups g
      where g.school_id=new.school_id and g.type=v_type and g.code=v_code
      limit 1;
    end if;
    new.group_id:=v_group.id;
  else
    select g.* into v_group
    from public.conduct_policy_groups g
    where g.id=new.group_id
    for share;
  end if;

  if not found
    or v_group.school_id<>new.school_id
    or v_group.tenant_id<>new.tenant_id
    or v_group.type<>v_type then
    raise exception 'Conduct policy group does not match this school and category type';
  end if;

  if new.active and not v_group.active then
    raise exception 'Active conduct items require an active group';
  end if;

  return new;
end;
$$;
revoke all on function app_private.ensure_conduct_category_group()
from public,anon,authenticated;

create trigger conduct_policy_category_group_scope
before insert or update of tenant_id,school_id,domain,direction,group_id,active
on public.conduct_policy_categories
for each row execute function app_private.ensure_conduct_category_group();

-- Backfill every existing category into a same-school group without changing its id.
update public.conduct_policy_categories
set updated_at=updated_at
where group_id is null;

alter table public.conduct_policy_categories
  alter column group_id set not null;

create or replace function app_private.freeze_conduct_category()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  c public.conduct_policy_categories%rowtype;
  g public.conduct_policy_groups%rowtype;
begin
  if tg_op='UPDATE' then
    if new.category_id is distinct from old.category_id
      or new.category_snapshot is distinct from old.category_snapshot
      or new.category_code is distinct from old.category_code
      or new.event_group_id is distinct from old.event_group_id then
      raise exception 'Event policy provenance is immutable';
    end if;
    if tg_table_name='conduct_events'
      and to_jsonb(new)->>'direction' is distinct from to_jsonb(old)->>'direction' then
      raise exception 'Event direction is immutable';
    end if;
    return new;
  end if;

  if new.category_id is null then
    if new.category_snapshot is not null or new.event_group_id is not null then
      raise exception 'Category is required';
    end if;
    return new;
  end if;

  select c1.*,g1.*
  into c,g
  from public.conduct_policy_categories c1
  join public.conduct_policy_groups g1 on g1.id=c1.group_id
  where c1.id=new.category_id
  for share of c1,g1;

  if c.id is null
    or c.school_id<>new.school_id
    or c.tenant_id<>new.tenant_id
    or c.domain<>(case when tg_table_name='conduct_events' then 'conduct' else 'achievement' end)
    or not c.active
    or not g.active then
    raise exception 'Category is not active in this school and domain';
  end if;

  new.category_code:=c.code;
  new.category_snapshot:=jsonb_build_object(
    'code',c.code,
    'display_name',c.display_name,
    'direction',c.direction,
    'default_severity',c.default_severity,
    'points',c.points,
    'requires_management_attention',c.requires_management_attention,
    'group',jsonb_build_object(
      'id',g.id,
      'code',g.code,
      'display_name',g.display_name,
      'type',g.type,
      'default_points',g.default_points,
      'default_severity',g.default_severity
    )
  );
  if tg_table_name='conduct_events' then new.direction:=c.direction; end if;
  return new;
end;
$$;

create or replace function public.upsert_conduct_policy_group(
  p_school_id uuid,
  p_group_id uuid,
  p_type text,
  p_code text,
  p_display_name text,
  p_default_points integer,
  p_default_severity text,
  p_sort_order integer,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  if (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),p_school_id)
    or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if p_type not in ('recognition','violation')
    or length(btrim(coalesce(p_code,''))) not between 1 and 40
    or length(btrim(coalesce(p_display_name,''))) not between 1 and 120
    or p_sort_order not between 0 and 10000
    or (p_default_severity is not null and p_default_severity not in ('routine','moderate','serious','critical')) then
    raise exception 'Check conduct policy group fields';
  end if;

  select tenant_id into v_tenant
  from public.schools
  where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School is unavailable'; end if;

  if p_group_id is null then
    insert into public.conduct_policy_groups(
      tenant_id,school_id,type,code,display_name,default_points,default_severity,sort_order,active
    ) values (
      v_tenant,p_school_id,p_type,upper(btrim(p_code)),btrim(p_display_name),p_default_points,
      case when p_type='violation' then p_default_severity else null end,
      p_sort_order,p_active
    ) returning id into v_id;
  else
    update public.conduct_policy_groups
    set type=p_type,
        code=upper(btrim(p_code)),
        display_name=btrim(p_display_name),
        default_points=p_default_points,
        default_severity=case when p_type='violation' then p_default_severity else null end,
        sort_order=p_sort_order,
        active=p_active,
        updated_at=now()
    where id=p_group_id and school_id=p_school_id
    returning id into v_id;
    if v_id is null then raise exception 'Conduct policy group is unavailable'; end if;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(v_tenant,p_school_id,(select auth.uid()),'conduct_policy.group_saved','conduct_policy_group',v_id);
  return v_id;
end;
$$;
revoke all on function public.upsert_conduct_policy_group(uuid,uuid,text,text,text,integer,text,integer,boolean)
from public,anon;
grant execute on function public.upsert_conduct_policy_group(uuid,uuid,text,text,text,integer,text,integer,boolean)
to authenticated;

create or replace function public.upsert_conduct_policy_category(
  p_school_id uuid,p_category_id uuid,p_domain text,p_direction text,p_code text,
  p_display_name text,p_default_severity text,p_points integer,p_sort_order integer,p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  if (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),p_school_id)
    or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School is unavailable'; end if;

  if p_category_id is null then
    insert into public.conduct_policy_categories(
      tenant_id,school_id,domain,direction,code,display_name,default_severity,points,sort_order,active
    ) values (
      v_tenant,p_school_id,p_domain,p_direction,upper(btrim(p_code)),btrim(p_display_name),
      p_default_severity,p_points,p_sort_order,p_active
    ) returning id into v_id;
  else
    update public.conduct_policy_categories
    set direction=p_direction,
        code=upper(btrim(p_code)),
        display_name=btrim(p_display_name),
        default_severity=p_default_severity,
        points=p_points,
        sort_order=p_sort_order,
        active=p_active,
        updated_at=now()
    where id=p_category_id and school_id=p_school_id and domain=p_domain
    returning id into v_id;
    if v_id is null then raise exception 'Category is unavailable'; end if;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(v_tenant,p_school_id,(select auth.uid()),'conduct_policy.saved','conduct_policy_category',v_id);
  return v_id;
end;
$$;

create function public.upsert_conduct_policy_category(
  p_school_id uuid,p_category_id uuid,p_group_id uuid,p_domain text,p_direction text,p_code text,
  p_display_name text,p_default_severity text,p_points integer,p_requires_management_attention boolean,
  p_sort_order integer,p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  if (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),p_school_id)
    or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School is unavailable'; end if;

  if p_category_id is null then
    insert into public.conduct_policy_categories(
      tenant_id,school_id,group_id,domain,direction,code,display_name,default_severity,points,
      requires_management_attention,sort_order,active
    ) values (
      v_tenant,p_school_id,p_group_id,p_domain,p_direction,upper(btrim(p_code)),btrim(p_display_name),
      p_default_severity,p_points,coalesce(p_requires_management_attention,false),p_sort_order,p_active
    ) returning id into v_id;
  else
    update public.conduct_policy_categories
    set group_id=p_group_id,
        direction=p_direction,
        code=upper(btrim(p_code)),
        display_name=btrim(p_display_name),
        default_severity=p_default_severity,
        points=p_points,
        requires_management_attention=coalesce(p_requires_management_attention,false),
        sort_order=p_sort_order,
        active=p_active,
        updated_at=now()
    where id=p_category_id and school_id=p_school_id and domain=p_domain
    returning id into v_id;
    if v_id is null then raise exception 'Category is unavailable'; end if;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(v_tenant,p_school_id,(select auth.uid()),'conduct_policy.saved','conduct_policy_category',v_id);
  return v_id;
end;
$$;
revoke all on function public.upsert_conduct_policy_category(uuid,uuid,uuid,text,text,text,text,text,integer,boolean,integer,boolean)
from public,anon;
grant execute on function public.upsert_conduct_policy_category(uuid,uuid,uuid,text,text,text,text,text,integer,boolean,integer,boolean)
to authenticated;

create or replace function public.retire_conduct_policy_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare c public.conduct_policy_categories%rowtype;
begin
  select * into c from public.conduct_policy_categories where id=p_category_id for update;
  if not found
    or (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),c.school_id)
    or not app_private.has_school_role(c.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  update public.conduct_policy_categories set active=false,updated_at=now() where id=c.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(c.tenant_id,c.school_id,(select auth.uid()),'conduct_policy.archived','conduct_policy_category',c.id);
end;
$$;

create function public.retire_conduct_policy_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare g public.conduct_policy_groups%rowtype;
begin
  select * into g from public.conduct_policy_groups where id=p_group_id for update;
  if not found
    or (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),g.school_id)
    or not app_private.has_school_role(g.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  update public.conduct_policy_groups set active=false,updated_at=now() where id=g.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(g.tenant_id,g.school_id,(select auth.uid()),'conduct_policy.group_archived','conduct_policy_group',g.id);
end;
$$;
revoke all on function public.retire_conduct_policy_group(uuid) from public,anon;
grant execute on function public.retire_conduct_policy_group(uuid) to authenticated;

create function public.delete_unused_conduct_policy_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare c public.conduct_policy_categories%rowtype;
begin
  select * into c from public.conduct_policy_categories where id=p_category_id for update;
  if not found then return; end if;
  if (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),c.school_id)
    or not app_private.has_school_role(c.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if exists(select 1 from public.conduct_events where category_id=c.id)
    or exists(select 1 from public.achievement_events where category_id=c.id) then
    raise exception 'Conduct item has historical references; archive it instead';
  end if;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(c.tenant_id,c.school_id,(select auth.uid()),'conduct_policy.deleted','conduct_policy_category',c.id);
  delete from public.conduct_policy_categories where id=c.id;
end;
$$;
revoke all on function public.delete_unused_conduct_policy_category(uuid) from public,anon;
grant execute on function public.delete_unused_conduct_policy_category(uuid) to authenticated;

create function public.delete_unused_conduct_policy_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare g public.conduct_policy_groups%rowtype;
begin
  select * into g from public.conduct_policy_groups where id=p_group_id for update;
  if not found then return; end if;
  if (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),g.school_id)
    or not app_private.has_school_role(g.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if exists(
    select 1
    from public.conduct_policy_categories c
    where c.group_id=g.id
      and (
        exists(select 1 from public.conduct_events e where e.category_id=c.id)
        or exists(select 1 from public.achievement_events a where a.category_id=c.id)
      )
  ) then
    raise exception 'Conduct group has historical references; archive it instead';
  end if;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(g.tenant_id,g.school_id,(select auth.uid()),'conduct_policy.group_deleted','conduct_policy_group',g.id);
  delete from public.conduct_policy_categories where group_id=g.id;
  delete from public.conduct_policy_groups where id=g.id;
end;
$$;
revoke all on function public.delete_unused_conduct_policy_group(uuid) from public,anon;
grant execute on function public.delete_unused_conduct_policy_group(uuid) to authenticated;

create or replace function app_private.record_conduct_group(
  p_school_id uuid,p_category_id uuid,p_domain text,p_date date,p_title text,p_details text,
  p_severity text,p_level text,p_learner_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  c public.conduct_policy_categories%rowtype;
  v_learner uuid;
  v_enrolment uuid;
  v_id uuid;
  v_ids uuid[]:='{}';
  v_learners uuid[];
  v_group uuid;
begin
  if (select auth.uid()) is null or not app_private.has_school_role(p_school_id,
    case when p_domain='conduct'
      then array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor']
      else array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
    end) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if p_date is null
    or p_date>(now() at time zone 'Africa/Windhoek')::date
    or length(btrim(coalesce(p_title,''))) not between 1 and 240
    or length(coalesce(p_details,''))>10000 then
    raise exception 'Check event date and text';
  end if;
  if coalesce(cardinality(p_learner_ids),0)=0
    or cardinality(p_learner_ids)>200
    or array_position(p_learner_ids,null) is not null then
    raise exception 'Choose between 1 and 200 learners';
  end if;

  select array_agg(distinct x order by x) into v_learners from unnest(p_learner_ids) x;
  select c1.* into c
  from public.conduct_policy_categories c1
  join public.conduct_policy_groups g on g.id=c1.group_id
  join public.schools s on s.id=c1.school_id
  where c1.id=p_category_id
    and c1.school_id=p_school_id
    and c1.domain=p_domain
    and c1.active
    and g.active
    and s.status='active'
  for share of c1,g;

  if not found then raise exception 'Category is not active in this school and domain'; end if;
  if cardinality(v_learners)>1 then v_group:=gen_random_uuid(); end if;

  foreach v_learner in array v_learners loop
    if not app_private.can_access_learner_observations(p_school_id,v_learner) then
      raise exception 'Learner is outside your conduct scope' using errcode='42501';
    end if;
    select e.id into v_enrolment
    from public.enrolments e
    where e.tenant_id=c.tenant_id
      and e.school_id=p_school_id
      and e.learner_id=v_learner
      and e.enrolled_from<=p_date
      and (e.enrolled_to is null or e.enrolled_to>=p_date)
    order by e.enrolled_from desc,e.id
    limit 1;
    if v_enrolment is null then
      raise exception 'Learner is not enrolled in this school on the event date';
    end if;

    if p_domain='conduct' then
      insert into public.conduct_events(
        tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,
        category_id,severity,summary,details,recorded_by_user_id,event_group_id
      ) values (
        c.tenant_id,p_school_id,v_learner,v_enrolment,p_date,c.direction,c.code,c.id,
        case when c.direction='positive' then 'routine' else coalesce(p_severity,c.default_severity,'routine') end,
        btrim(p_title),nullif(btrim(p_details),''),(select auth.uid()),v_group
      ) returning id into v_id;
    else
      insert into public.achievement_events(
        tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,category_id,
        title,description,level,recorded_by_user_id,event_group_id
      ) values (
        c.tenant_id,p_school_id,v_learner,v_enrolment,p_date,c.code,c.id,btrim(p_title),
        nullif(btrim(p_details),''),p_level,(select auth.uid()),v_group
      ) returning id into v_id;
    end if;

    v_ids:=array_append(v_ids,v_id);
    insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
    values(c.tenant_id,p_school_id,(select auth.uid()),p_domain||'.recorded',p_domain||'_event',v_id);
  end loop;
  return v_ids;
end;
$$;
revoke all on function app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])
from public,anon,authenticated;

create function public.ensure_conduct_starter_policy(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant uuid;
  g_general uuid;
  g_academic uuid;
  g_sport uuid;
  g_l1 uuid;
  g_l2 uuid;
  g_l3 uuid;
begin
  if (select auth.uid()) is null
    or not app_private.user_current_school_matches((select auth.uid()),p_school_id)
    or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if exists(select 1 from public.conduct_policy_categories where school_id=p_school_id)
    or exists(select 1 from public.conduct_policy_groups where school_id=p_school_id) then
    return;
  end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School is unavailable'; end if;

  insert into public.conduct_policy_groups(tenant_id,school_id,type,code,display_name,default_points,sort_order)
  values(v_tenant,p_school_id,'recognition','GENERAL','General',3,10) returning id into g_general;
  insert into public.conduct_policy_groups(tenant_id,school_id,type,code,display_name,default_points,sort_order)
  values(v_tenant,p_school_id,'recognition','ACADEMIC','Academic',3,20) returning id into g_academic;
  insert into public.conduct_policy_groups(tenant_id,school_id,type,code,display_name,default_points,sort_order)
  values(v_tenant,p_school_id,'recognition','SPORT_CULTURE','Sport / Culture',3,30) returning id into g_sport;
  insert into public.conduct_policy_groups(tenant_id,school_id,type,code,display_name,default_points,default_severity,sort_order)
  values(v_tenant,p_school_id,'violation','LEVEL_1','Level 1',-1,'routine',40) returning id into g_l1;
  insert into public.conduct_policy_groups(tenant_id,school_id,type,code,display_name,default_points,default_severity,sort_order)
  values(v_tenant,p_school_id,'violation','LEVEL_2','Level 2',-3,'moderate',50) returning id into g_l2;
  insert into public.conduct_policy_groups(tenant_id,school_id,type,code,display_name,default_points,default_severity,sort_order)
  values(v_tenant,p_school_id,'violation','LEVEL_3','Level 3',-5,'serious',60) returning id into g_l3;

  insert into public.conduct_policy_categories(
    tenant_id,school_id,group_id,domain,direction,code,display_name,points,sort_order,active
  ) values
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_01','Reporting of negative behaviour of other learners',3,10,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_02','Handed in lost goods/money',3,20,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_03','Honesty',3,30,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_04','Good exemplary conduct',3,40,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_05','Helpfulness',3,50,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_06','Sense of duty',3,60,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_07','Loving behaviour',3,70,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_08','Politeness',3,80,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_09','Practising self-control',3,90,true),
    (v_tenant,p_school_id,g_general,'conduct','positive','REC_GEN_10','Show patience',3,100,true),
    (v_tenant,p_school_id,g_academic,'conduct','positive','REC_ACA_01','Participation: Enrichment Programmes',3,10,true),
    (v_tenant,p_school_id,g_academic,'conduct','positive','REC_ACA_02','Continuous hard work (Academic)',3,20,true),
    (v_tenant,p_school_id,g_sport,'conduct','positive','REC_SPORT_01','Participation: Sport/Culture outside school',3,10,true);

  insert into public.conduct_policy_categories(
    tenant_id,school_id,group_id,domain,direction,code,display_name,default_severity,points,
    requires_management_attention,sort_order,active
  ) values
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_01','Staying away from compulsory school activities','routine',-1,false,10,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_02','Arrogant / Bad mannered','routine',-1,false,20,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_03','Blatantly disobedient','routine',-1,false,30,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_04','Book(s) not at school / Forgot books at home','routine',-1,false,40,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_05','Eat in the classroom','routine',-1,false,50,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_06','Use of Cellphone during class/school hours','routine',-1,false,60,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_07','Homework/project not done','routine',-1,false,70,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_08','Late for School','routine',-1,false,80,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_09','Dishonest','routine',-1,false,90,true),
    (v_tenant,p_school_id,g_l1,'conduct','negative','VIO_L1_10','Keeps on talking in class','routine',-1,false,100,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_01','Disruptive / Interrupt lessons','moderate',-3,false,10,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_02','Infringement of honor/privacy','moderate',-3,false,20,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_03','Fighting / instigating','serious',-3,true,30,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_04','Damaging school property','serious',-3,true,40,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_05','Leave school without permission','moderate',-3,true,50,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_06','Chronically away from school','moderate',-3,true,60,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_07','Letting school down (in public)','moderate',-3,false,70,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_08','Cheating in tests / exams','serious',-3,true,80,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_09','Smoking / Vaping','serious',-3,true,90,true),
    (v_tenant,p_school_id,g_l2,'conduct','negative','VIO_L2_10','Swearing or foul/abusive language','moderate',-3,false,100,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_01','Assault / Harassment','critical',-5,true,10,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_02','In possession of a vape','serious',-5,true,20,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_03','Theft / Stealing','serious',-5,true,30,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_04','Found with Drugs / Alcohol','critical',-5,true,40,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_05','Dangerous weapons','critical',-5,true,50,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_06','Act of racism','critical',-5,true,60,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_07','Sexual harassment','critical',-5,true,70,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_08','Bullying / Victimizing','critical',-5,true,80,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_09','Threaten other learners','critical',-5,true,90,true),
    (v_tenant,p_school_id,g_l3,'conduct','negative','VIO_L3_10','Inappropriate behaviour / material / literature','serious',-5,true,100,true);

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(v_tenant,p_school_id,(select auth.uid()),'conduct_policy.starter_created','school',p_school_id);
end;
$$;
revoke all on function public.ensure_conduct_starter_policy(uuid) from public,anon;
grant execute on function public.ensure_conduct_starter_policy(uuid) to authenticated;

comment on table public.conduct_policy_groups is
'School-configurable Recognition/Violation grouping for conduct policy items. Starter groups are editable defaults, not national rules.';
comment on column public.conduct_policy_categories.group_id is
'Current policy group. Historical events freeze group meaning inside category_snapshot and are not rewritten when this relation changes.';
comment on column public.conduct_policy_categories.requires_management_attention is
'Policy hint for new events that should surface promptly to management; it is snapshotted at record time.';
