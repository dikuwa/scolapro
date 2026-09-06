-- Additive rollout: legacy category_code remains authoritative until reconciled.
create table public.conduct_policy_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  school_id uuid not null references public.schools(id),
  domain text not null check (domain in ('conduct','achievement')),
  direction text check (direction in ('positive','negative')),
  code text not null check (length(btrim(code)) between 1 and 40),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  default_severity text check (default_severity in ('routine','moderate','serious','critical')),
  points integer,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,domain,code),
  check ((domain='conduct' and direction is not null) or
    (domain='achievement' and direction is null and default_severity is null))
);
create index conduct_policy_categories_scope_idx on public.conduct_policy_categories(school_id,domain,active,sort_order);
create index conduct_policy_categories_tenant_idx on public.conduct_policy_categories(tenant_id);
alter table public.conduct_policy_categories enable row level security;
revoke all on public.conduct_policy_categories from anon,authenticated;
grant select on public.conduct_policy_categories to authenticated;
create policy "operational staff read conduct categories" on public.conduct_policy_categories
for select to authenticated using (app_private.can_view_operational_learners(school_id));
create trigger conduct_policy_category_school_scope before insert or update on public.conduct_policy_categories
for each row execute function app_private.enforce_school_scoped_root_integrity();

alter table public.conduct_events
  add column category_id uuid references public.conduct_policy_categories(id) on delete restrict,
  add column category_snapshot jsonb,
  add column event_group_id uuid;
alter table public.achievement_events
  add column category_id uuid references public.conduct_policy_categories(id) on delete restrict,
  add column category_snapshot jsonb,
  add column event_group_id uuid;
create index conduct_events_category_idx on public.conduct_events(category_id);
create index achievement_events_category_idx on public.achievement_events(category_id);
create index conduct_events_group_idx on public.conduct_events(school_id,event_group_id) where event_group_id is not null;
create index achievement_events_group_idx on public.achievement_events(school_id,event_group_id) where event_group_id is not null;
comment on column public.conduct_events.category_id is 'Required by recording RPC; nullable only for unreconciled legacy history. Do not infer a policy from historical free text.';
comment on column public.achievement_events.category_id is 'Required by recording RPC; nullable only for unreconciled legacy history.';
comment on column public.conduct_events.category_code is 'Preserved historical code; new events copy configured category code and freeze policy metadata.';

create function app_private.freeze_conduct_category() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.conduct_policy_categories%rowtype;
begin
  if tg_op='UPDATE' then
    if new.category_id is distinct from old.category_id or new.category_snapshot is distinct from old.category_snapshot
      or new.category_code is distinct from old.category_code or new.event_group_id is distinct from old.event_group_id then
      raise exception 'Event policy provenance is immutable';
    end if;
    if tg_table_name='conduct_events' and to_jsonb(new)->>'direction' is distinct from to_jsonb(old)->>'direction' then
      raise exception 'Event direction is immutable';
    end if;
    return new;
  end if;
  if new.category_id is null then
    if new.category_snapshot is not null or new.event_group_id is not null then raise exception 'Category is required'; end if;
    return new;
  end if;
  select * into c from public.conduct_policy_categories where id=new.category_id for share;
  if not found or c.school_id<>new.school_id or c.tenant_id<>new.tenant_id
    or c.domain<>(case when tg_table_name='conduct_events' then 'conduct' else 'achievement' end) or not c.active then
    raise exception 'Category is not active in this school and domain';
  end if;
  new.category_code:=c.code;
  new.category_snapshot:=jsonb_build_object('code',c.code,'display_name',c.display_name,'direction',c.direction,'default_severity',c.default_severity,'points',c.points);
  if tg_table_name='conduct_events' then new.direction:=c.direction; end if;
  return new;
end $$;
revoke all on function app_private.freeze_conduct_category() from public,anon,authenticated;
create trigger conduct_policy_provenance before insert or update on public.conduct_events
for each row execute function app_private.freeze_conduct_category();
create trigger achievement_policy_provenance before insert or update on public.achievement_events
for each row execute function app_private.freeze_conduct_category();

create function public.upsert_conduct_policy_category(
  p_school_id uuid,p_category_id uuid,p_domain text,p_direction text,p_code text,
  p_display_name text,p_default_severity text,p_points integer,p_sort_order integer,p_active boolean
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_tenant uuid; v_id uuid;
begin
  if auth.uid() is null or not app_private.has_school_role(p_school_id,array['school_admin','principal']) then
    raise exception 'Permission denied' using errcode='42501'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School is unavailable'; end if;
  if p_category_id is null then
    insert into public.conduct_policy_categories(tenant_id,school_id,domain,direction,code,display_name,default_severity,points,sort_order,active)
    values(v_tenant,p_school_id,p_domain,p_direction,upper(btrim(p_code)),btrim(p_display_name),p_default_severity,p_points,p_sort_order,p_active) returning id into v_id;
  else
    update public.conduct_policy_categories set direction=p_direction,code=upper(btrim(p_code)),display_name=btrim(p_display_name),
      default_severity=p_default_severity,points=p_points,sort_order=p_sort_order,active=p_active,updated_at=now()
    where id=p_category_id and school_id=p_school_id and domain=p_domain returning id into v_id;
    if v_id is null then raise exception 'Category is unavailable'; end if;
  end if;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(v_tenant,p_school_id,auth.uid(),'conduct_policy.saved','conduct_policy_category',v_id);
  return v_id;
end $$;
revoke all on function public.upsert_conduct_policy_category(uuid,uuid,text,text,text,text,text,integer,integer,boolean) from public,anon;
grant execute on function public.upsert_conduct_policy_category(uuid,uuid,text,text,text,text,text,integer,integer,boolean) to authenticated;

create function public.retire_conduct_policy_category(p_category_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.conduct_policy_categories%rowtype;
begin
  select * into c from public.conduct_policy_categories where id=p_category_id for update;
  if not found or auth.uid() is null or not app_private.has_school_role(c.school_id,array['school_admin','principal']) then
    raise exception 'Permission denied' using errcode='42501'; end if;
  update public.conduct_policy_categories set active=false,updated_at=now() where id=c.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(c.tenant_id,c.school_id,auth.uid(),'conduct_policy.archived','conduct_policy_category',c.id);
end $$;
revoke all on function public.retire_conduct_policy_category(uuid) from public,anon;
grant execute on function public.retire_conduct_policy_category(uuid) to authenticated;

-- Domain-specific public wrappers share one private atomic implementation.
create function app_private.record_conduct_group(
  p_school_id uuid,p_category_id uuid,p_domain text,p_date date,p_title text,p_details text,
  p_severity text,p_level text,p_learner_ids uuid[]
) returns uuid[] language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.conduct_policy_categories%rowtype; v_learner uuid; v_enrolment uuid;
  v_id uuid; v_ids uuid[]:='{}'; v_learners uuid[]; v_group uuid;
begin
  if auth.uid() is null or not app_private.has_school_role(p_school_id,
    case when p_domain='conduct' then array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor']
    else array['school_admin','principal','deputy_principal','hod','teacher','class_teacher'] end) then
    raise exception 'Permission denied' using errcode='42501'; end if;
  if p_date is null or p_date>(now() at time zone 'Africa/Windhoek')::date or length(btrim(coalesce(p_title,''))) not between 1 and 240
    or length(coalesce(p_details,''))>10000 then raise exception 'Check event date and text'; end if;
  if coalesce(cardinality(p_learner_ids),0)=0 or cardinality(p_learner_ids)>200 or array_position(p_learner_ids,null) is not null then
    raise exception 'Choose between 1 and 200 learners'; end if;
  select array_agg(distinct x order by x) into v_learners from unnest(p_learner_ids) x;
  select c1.* into c from public.conduct_policy_categories c1 join public.schools s on s.id=c1.school_id
  where c1.id=p_category_id and c1.school_id=p_school_id and c1.domain=p_domain and c1.active and s.status='active' for share of c1;
  if not found then raise exception 'Category is not active in this school and domain'; end if;
  if cardinality(v_learners)>1 then v_group:=gen_random_uuid(); end if;
  foreach v_learner in array v_learners loop
    if not app_private.can_access_learner_observations(p_school_id,v_learner) then
      raise exception 'Learner is outside your conduct scope' using errcode='42501'; end if;
    select e.id into v_enrolment from public.enrolments e where e.tenant_id=c.tenant_id and e.school_id=p_school_id
      and e.learner_id=v_learner and e.enrolled_from<=p_date and (e.enrolled_to is null or e.enrolled_to>=p_date)
      order by e.enrolled_from desc,e.id limit 1;
    if v_enrolment is null then raise exception 'Learner is not enrolled in this school on the event date'; end if;
    if p_domain='conduct' then
      insert into public.conduct_events(tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,category_id,severity,summary,details,recorded_by_user_id,event_group_id)
      values(c.tenant_id,p_school_id,v_learner,v_enrolment,p_date,c.direction,c.code,c.id,
        case when c.direction='positive' then 'routine' else coalesce(p_severity,c.default_severity,'routine') end,
        btrim(p_title),nullif(btrim(p_details),''),auth.uid(),v_group) returning id into v_id;
    else
      insert into public.achievement_events(tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,category_id,title,description,level,recorded_by_user_id,event_group_id)
      values(c.tenant_id,p_school_id,v_learner,v_enrolment,p_date,c.code,c.id,btrim(p_title),nullif(btrim(p_details),''),p_level,auth.uid(),v_group) returning id into v_id;
    end if;
    v_ids:=array_append(v_ids,v_id);
    insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
    values(c.tenant_id,p_school_id,auth.uid(),p_domain||'.recorded',p_domain||'_event',v_id);
  end loop;
  return v_ids;
end $$;
revoke all on function app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[]) from public,anon,authenticated;

create function public.create_conduct_event_group(p_school_id uuid,p_category_id uuid,p_severity text,p_summary text,p_details text,p_occurred_on date,p_learner_ids uuid[])
returns uuid[] language sql security definer set search_path=pg_catalog,public,app_private as $$
select app_private.record_conduct_group(p_school_id,p_category_id,'conduct',p_occurred_on,p_summary,p_details,p_severity,null,p_learner_ids); $$;
create function public.create_achievement_event_group(p_school_id uuid,p_category_id uuid,p_title text,p_description text,p_level text,p_achieved_on date,p_learner_ids uuid[])
returns uuid[] language sql security definer set search_path=pg_catalog,public,app_private as $$
select app_private.record_conduct_group(p_school_id,p_category_id,'achievement',p_achieved_on,p_title,p_description,null,p_level,p_learner_ids); $$;
revoke all on function public.create_conduct_event_group(uuid,uuid,text,text,text,date,uuid[]) from public,anon;
revoke all on function public.create_achievement_event_group(uuid,uuid,text,text,text,date,uuid[]) from public,anon;
grant execute on function public.create_conduct_event_group(uuid,uuid,text,text,text,date,uuid[]) to authenticated;
grant execute on function public.create_achievement_event_group(uuid,uuid,text,text,text,date,uuid[]) to authenticated;
-- Existing RLS-protected insert/update grants remain available for established
-- referral integrations. The new application workflow records through the
-- governed group RPCs, while the existing scope and recorder triggers continue
-- to protect legacy writers during the category-reconciliation window.

create function public.list_conduct_learners(p_school_id uuid,p_on date)
returns table(learner_id uuid,learner_name text,class_id uuid,class_name text,grade_id uuid,grade_name text)
language sql stable security definer set search_path=pg_catalog,public,app_private as $$
  select distinct l.id, l.first_names||' '||l.surname,rc.id,rc.display_name,g.id,g.display_name
  from public.enrolments e join public.learners l on l.id=e.learner_id
  left join public.register_classes rc on rc.id=e.register_class_id
  left join public.grades g on g.id=rc.grade_id
  where auth.uid() is not null and e.school_id=p_school_id and e.enrolled_from<=p_on
    and (e.enrolled_to is null or e.enrolled_to>=p_on)
    and app_private.can_access_learner_observations(p_school_id,e.learner_id)
  order by 2,1;
$$;
revoke all on function public.list_conduct_learners(uuid,date) from public,anon;
grant execute on function public.list_conduct_learners(uuid,date) to authenticated;

create function public.list_conduct_history(p_school_id uuid,p_domain text,p_learner_id uuid default null,p_class_id uuid default null,p_grade_id uuid default null,p_page integer default 0)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
with events as (
  select e.id,e.learner_id,e.enrolment_id,e.event_group_id,e.occurred_on as event_date,e.summary as title,e.details,
    e.category_code,e.category_snapshot,e.direction,e.severity,e.status,null::text as level
  from public.conduct_events e where e.school_id=p_school_id and p_domain='conduct'
  union all
  select e.id,e.learner_id,e.enrolment_id,e.event_group_id,e.achieved_on,e.title,e.description,
    e.category_code,e.category_snapshot,'positive',null,null,e.level
  from public.achievement_events e where e.school_id=p_school_id and p_domain='achievement'
), visible as (
  select e.*,l.first_names||' '||l.surname as learner_name,coalesce(e.event_group_id,e.id) as group_key
  from events e join public.learners l on l.id=e.learner_id
  left join public.enrolments en on en.id=e.enrolment_id
  left join public.register_classes rc on rc.id=en.register_class_id
  where (p_learner_id is null or e.learner_id=p_learner_id)
    and (p_class_id is null or en.register_class_id=p_class_id)
    and (p_grade_id is null or rc.grade_id=p_grade_id)
), groups as (
  select group_key,max(event_date) as event_date from visible group by group_key
  order by max(event_date) desc,group_key limit 21 offset (greatest(0,least(coalesce(p_page,0),10000))*20)
), page_groups as (
  select * from groups order by event_date desc,group_key limit 20
)
select jsonb_build_object('hasMore',(select count(*)>20 from groups),'events',coalesce((
 select jsonb_agg(to_jsonb(v) order by v.event_date desc,v.group_key,v.learner_name,v.id)
 from visible v join page_groups g using(group_key)
),'[]'::jsonb));
$$;
revoke all on function public.list_conduct_history(uuid,text,uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.list_conduct_history(uuid,text,uuid,uuid,uuid,integer) to authenticated;
