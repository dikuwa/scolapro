-- Issue #552 — Sports & Houses Phase 2 assisted balancing.
-- Preview-first deterministic balancing over the canonical assignment tables.
-- Manual/locked assignments and staff leaders remain fixed; apply is atomic and finality-safe.

create or replace function app_private.can_manage_sports(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with actor as (
    select (select auth.uid()) as user_id
  ),
  today as (
    select (now() at time zone 'Africa/Windhoek')::date as value
  )
  select (select user_id from actor) is not null
    and not exists (
      select 1
      from public.platform_memberships pm
      cross join today t
      where pm.user_id=(select user_id from actor)
        and pm.role_key='platform_support'
        and pm.active_from<=t.value
        and (pm.active_to is null or pm.active_to>=t.value)
    )
    and (
      exists (
        select 1
        from public.platform_memberships pm
        cross join today t
        where pm.user_id=(select user_id from actor)
          and pm.role_key='platform_admin'
          and pm.active_from<=t.value
          and (pm.active_to is null or pm.active_to>=t.value)
      )
      or app_private.has_school_local_role(
        p_school_id,
        array['school_admin','principal','deputy_principal']
      )
    );
$$;

revoke all on function app_private.can_manage_sports(uuid) from public,anon;
grant execute on function app_private.can_manage_sports(uuid) to authenticated;

create table public.sports_house_balancing_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  balance_scope text not null check (balance_scope in ('learner','staff')),
  algorithm_version text not null,
  client_operation_id uuid not null,
  configuration_snapshot jsonb not null default '{}'::jsonb,
  before_totals jsonb not null default '[]'::jsonb,
  after_totals jsonb not null default '[]'::jsonb,
  proposed_moves jsonb not null default '[]'::jsonb,
  applied_moves jsonb not null default '[]'::jsonb,
  status text not null default 'preview' check (status in ('preview','applied')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_by_user_id uuid references auth.users(id) on delete restrict,
  applied_at timestamptz,
  unique (school_id, academic_year, balance_scope, client_operation_id),
  check (
    (status='preview' and applied_by_user_id is null and applied_at is null)
    or
    (status='applied' and applied_by_user_id is not null and applied_at is not null)
  )
);

create table public.sports_house_balancing_moves (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sports_house_balancing_runs(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  entity_type text not null check (entity_type in ('learner','staff')),
  learner_id uuid references public.learners(id) on delete restrict,
  staff_member_id uuid references public.staff_members(id) on delete restrict,
  from_house_id uuid references public.sports_houses(id) on delete restrict,
  to_house_id uuid not null references public.sports_houses(id) on delete restrict,
  before_assignment_source text,
  before_is_locked boolean,
  staff_role_key text,
  sex text,
  age_group_id uuid references public.sports_age_groups(id) on delete set null,
  grade_id uuid references public.grades(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (entity_type='learner' and learner_id is not null and staff_member_id is null)
    or
    (entity_type='staff' and staff_member_id is not null and learner_id is null)
  ),
  unique (run_id, entity_type, learner_id),
  unique (run_id, entity_type, staff_member_id)
);

create index sports_house_balancing_runs_school_year_idx
  on public.sports_house_balancing_runs(school_id,academic_year,created_at desc);
create index sports_house_balancing_moves_run_idx
  on public.sports_house_balancing_moves(run_id,entity_type);

alter table public.sports_house_balancing_runs enable row level security;
alter table public.sports_house_balancing_moves enable row level security;

create policy "sports managers read balancing runs"
on public.sports_house_balancing_runs
for select to authenticated
using (app_private.can_manage_sports(school_id));

create policy "sports managers read balancing moves"
on public.sports_house_balancing_moves
for select to authenticated
using (app_private.can_manage_sports(school_id));

revoke all on public.sports_house_balancing_runs,public.sports_house_balancing_moves from anon,authenticated;
grant select on public.sports_house_balancing_runs,public.sports_house_balancing_moves to authenticated;
grant select,insert,update,delete on public.sports_house_balancing_runs,public.sports_house_balancing_moves to service_role;

create or replace function public.preview_sports_house_balancing(
  p_school_id uuid,
  p_academic_year integer,
  p_balance_scope text,
  p_client_operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private,pg_temp
as $$
declare
  v_tenant_id uuid;
  v_run_id uuid;
  v_algorithm constant text := 'deterministic-greedy-v1';
  v_settings public.sports_year_settings%rowtype;
  v_candidate record;
  v_target_house uuid;
  v_before jsonb;
  v_after jsonb;
  v_moves jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year not between 2000 and 2200 then raise exception 'Academic year is invalid'; end if;
  if p_balance_scope not in ('learner','staff') then raise exception 'Balancing scope must be learner or staff'; end if;
  if p_client_operation_id is null then raise exception 'Client operation ID is required'; end if;

  select id into v_run_id
  from public.sports_house_balancing_runs
  where school_id=p_school_id
    and academic_year=p_academic_year
    and balance_scope=p_balance_scope
    and client_operation_id=p_client_operation_id;
  if v_run_id is not null then return v_run_id; end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id=p_school_id and status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  if (select count(*) from public.sports_houses where school_id=p_school_id and status='active') < 2 then
    raise exception 'At least two active houses are required for balancing';
  end if;

  select * into v_settings
  from public.sports_year_settings
  where school_id=p_school_id and academic_year=p_academic_year;

  create temporary table _sports_balance_candidates(
    entity_id uuid primary key,
    from_house_id uuid,
    assignment_source text,
    is_locked boolean,
    staff_role_key text,
    sex text,
    age_group_id uuid,
    grade_id uuid
  ) on commit drop;

  create temporary table _sports_balance_fixed(
    house_id uuid not null,
    sex text,
    age_group_id uuid,
    grade_id uuid
  ) on commit drop;

  create temporary table _sports_balance_proposals(
    entity_id uuid primary key,
    from_house_id uuid,
    to_house_id uuid not null,
    assignment_source text,
    is_locked boolean,
    staff_role_key text,
    sex text,
    age_group_id uuid,
    grade_id uuid
  ) on commit drop;

  if p_balance_scope='learner' then
    insert into _sports_balance_candidates(entity_id,from_house_id,assignment_source,is_locked,sex,age_group_id,grade_id)
    select distinct on (e.learner_id)
      e.learner_id,
      a.house_id,
      a.assignment_source,
      coalesce(a.is_locked,false),
      l.sex,
      ag.id,
      e.grade_id
    from public.enrolments e
    join public.learners l
      on l.id=e.learner_id and l.tenant_id=e.tenant_id
    left join public.sports_learner_house_assignments a
      on a.tenant_id=e.tenant_id
     and a.school_id=e.school_id
     and a.academic_year=e.academic_year
     and a.learner_id=e.learner_id
    left join lateral (
      select g.id
      from public.sports_age_groups g
      where g.tenant_id=e.tenant_id
        and g.school_id=e.school_id
        and g.status='active'
        and v_settings.age_reference_date is not null
        and l.date_of_birth is not null
        and (g.min_age is null or extract(year from age(v_settings.age_reference_date,l.date_of_birth))::integer>=g.min_age)
        and (g.max_age is null or extract(year from age(v_settings.age_reference_date,l.date_of_birth))::integer<=g.max_age)
      order by g.sort_order,g.label,g.id
      limit 1
    ) ag on true
    where e.tenant_id=v_tenant_id
      and e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status in ('current','completed','transferred')
      and (
        a.id is null
        or (a.is_locked=false and a.assignment_source<>'manual')
      )
    order by e.learner_id,
      case when e.status='current' then 0 else 1 end,
      e.enrolled_from desc,
      e.id;

    insert into _sports_balance_fixed(house_id,sex,age_group_id,grade_id)
    select
      a.house_id,
      l.sex,
      ag.id,
      e.grade_id
    from public.sports_learner_house_assignments a
    join public.learners l on l.id=a.learner_id and l.tenant_id=a.tenant_id
    left join lateral (
      select e2.grade_id
      from public.enrolments e2
      where e2.tenant_id=a.tenant_id
        and e2.school_id=a.school_id
        and e2.academic_year=a.academic_year
        and e2.learner_id=a.learner_id
      order by case when e2.status='current' then 0 else 1 end,e2.enrolled_from desc,e2.id
      limit 1
    ) e on true
    left join lateral (
      select g.id
      from public.sports_age_groups g
      where g.tenant_id=a.tenant_id
        and g.school_id=a.school_id
        and g.status='active'
        and v_settings.age_reference_date is not null
        and l.date_of_birth is not null
        and (g.min_age is null or extract(year from age(v_settings.age_reference_date,l.date_of_birth))::integer>=g.min_age)
        and (g.max_age is null or extract(year from age(v_settings.age_reference_date,l.date_of_birth))::integer<=g.max_age)
      order by g.sort_order,g.label,g.id
      limit 1
    ) ag on true
    where a.tenant_id=v_tenant_id
      and a.school_id=p_school_id
      and a.academic_year=p_academic_year
      and not exists(select 1 from _sports_balance_candidates c where c.entity_id=a.learner_id);

    for v_candidate in
      select * from _sports_balance_candidates
      order by coalesce(sex,''),coalesce(age_group_id::text,''),coalesce(grade_id::text,''),entity_id
    loop
      select h.id into v_target_house
      from public.sports_houses h
      where h.tenant_id=v_tenant_id
        and h.school_id=p_school_id
        and h.status='active'
      order by
        (select count(*) from _sports_balance_fixed f where f.house_id=h.id)
        + (select count(*) from _sports_balance_proposals p where p.to_house_id=h.id),
        case when coalesce(v_settings.balance_by_sex,true) then
          (select count(*) from _sports_balance_fixed f where f.house_id=h.id and f.sex is not distinct from v_candidate.sex)
          + (select count(*) from _sports_balance_proposals p where p.to_house_id=h.id and p.sex is not distinct from v_candidate.sex)
          else 0 end,
        case when coalesce(v_settings.balance_by_age_group,false) then
          (select count(*) from _sports_balance_fixed f where f.house_id=h.id and f.age_group_id is not distinct from v_candidate.age_group_id)
          + (select count(*) from _sports_balance_proposals p where p.to_house_id=h.id and p.age_group_id is not distinct from v_candidate.age_group_id)
          else 0 end,
        case when coalesce(v_settings.balance_by_grade,false) then
          (select count(*) from _sports_balance_fixed f where f.house_id=h.id and f.grade_id is not distinct from v_candidate.grade_id)
          + (select count(*) from _sports_balance_proposals p where p.to_house_id=h.id and p.grade_id is not distinct from v_candidate.grade_id)
          else 0 end,
        h.sort_order,h.name,h.id
      limit 1;

      insert into _sports_balance_proposals values(
        v_candidate.entity_id,v_candidate.from_house_id,v_target_house,
        v_candidate.assignment_source,v_candidate.is_locked,null,
        v_candidate.sex,v_candidate.age_group_id,v_candidate.grade_id
      );
    end loop;
  else
    insert into _sports_balance_candidates(entity_id,from_house_id,assignment_source,is_locked,staff_role_key)
    select distinct
      ssa.staff_member_id,
      a.house_id,
      a.assignment_source,
      coalesce(a.is_locked,false),
      a.role_key
    from public.staff_school_assignments ssa
    join public.staff_members sm
      on sm.id=ssa.staff_member_id and sm.tenant_id=ssa.tenant_id
    left join public.sports_staff_house_assignments a
      on a.tenant_id=ssa.tenant_id
     and a.school_id=ssa.school_id
     and a.academic_year=p_academic_year
     and a.staff_member_id=ssa.staff_member_id
    where ssa.tenant_id=v_tenant_id
      and ssa.school_id=p_school_id
      and ssa.effective_from<=make_date(p_academic_year,12,31)
      and (ssa.effective_to is null or ssa.effective_to>=make_date(p_academic_year,1,1))
      and (
        a.id is null
        or (
          a.role_key<>'leader'
          and a.is_locked=false
          and a.assignment_source<>'manual'
        )
      );

    insert into _sports_balance_fixed(house_id)
    select a.house_id
    from public.sports_staff_house_assignments a
    where a.tenant_id=v_tenant_id
      and a.school_id=p_school_id
      and a.academic_year=p_academic_year
      and not exists(select 1 from _sports_balance_candidates c where c.entity_id=a.staff_member_id);

    for v_candidate in
      select * from _sports_balance_candidates order by entity_id
    loop
      select h.id into v_target_house
      from public.sports_houses h
      where h.tenant_id=v_tenant_id
        and h.school_id=p_school_id
        and h.status='active'
      order by
        (select count(*) from _sports_balance_fixed f where f.house_id=h.id)
        + (select count(*) from _sports_balance_proposals p where p.to_house_id=h.id),
        h.sort_order,h.name,h.id
      limit 1;

      insert into _sports_balance_proposals values(
        v_candidate.entity_id,v_candidate.from_house_id,v_target_house,
        v_candidate.assignment_source,v_candidate.is_locked,v_candidate.staff_role_key,
        null,null,null
      );
    end loop;
  end if;

  if p_balance_scope='learner' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'house_id',h.id,'house_name',h.name,'total',
      (select count(*) from public.sports_learner_house_assignments a
       where a.school_id=p_school_id and a.academic_year=p_academic_year and a.house_id=h.id)
    ) order by h.sort_order,h.name,h.id),'[]'::jsonb)
    into v_before
    from public.sports_houses h
    where h.school_id=p_school_id and h.status<>'archived';

    select coalesce(jsonb_agg(jsonb_build_object(
      'house_id',h.id,'house_name',h.name,'total',
      (select count(*) from public.sports_learner_house_assignments a
       where a.school_id=p_school_id and a.academic_year=p_academic_year and a.house_id=h.id)
      - (select count(*) from _sports_balance_proposals p where p.from_house_id=h.id and p.to_house_id<>h.id)
      + (select count(*) from _sports_balance_proposals p where p.to_house_id=h.id and p.from_house_id is distinct from h.id)
    ) order by h.sort_order,h.name,h.id),'[]'::jsonb)
    into v_after
    from public.sports_houses h
    where h.school_id=p_school_id and h.status<>'archived';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'house_id',h.id,'house_name',h.name,'total',
      (select count(*) from public.sports_staff_house_assignments a
       where a.school_id=p_school_id and a.academic_year=p_academic_year and a.house_id=h.id)
    ) order by h.sort_order,h.name,h.id),'[]'::jsonb)
    into v_before
    from public.sports_houses h
    where h.school_id=p_school_id and h.status<>'archived';

    select coalesce(jsonb_agg(jsonb_build_object(
      'house_id',h.id,'house_name',h.name,'total',
      (select count(*) from public.sports_staff_house_assignments a
       where a.school_id=p_school_id and a.academic_year=p_academic_year and a.house_id=h.id)
      - (select count(*) from _sports_balance_proposals p where p.from_house_id=h.id and p.to_house_id<>h.id)
      + (select count(*) from _sports_balance_proposals p where p.to_house_id=h.id and p.from_house_id is distinct from h.id)
    ) order by h.sort_order,h.name,h.id),'[]'::jsonb)
    into v_after
    from public.sports_houses h
    where h.school_id=p_school_id and h.status<>'archived';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entity_id',p.entity_id,
    'from_house_id',p.from_house_id,
    'to_house_id',p.to_house_id,
    'assignment_source',p.assignment_source,
    'is_locked',coalesce(p.is_locked,false),
    'staff_role_key',p.staff_role_key,
    'sex',p.sex,
    'age_group_id',p.age_group_id,
    'grade_id',p.grade_id
  ) order by p.entity_id),'[]'::jsonb)
  into v_moves
  from _sports_balance_proposals p
  where p.from_house_id is distinct from p.to_house_id;

  insert into public.sports_house_balancing_runs(
    tenant_id,school_id,academic_year,balance_scope,algorithm_version,client_operation_id,
    configuration_snapshot,before_totals,after_totals,proposed_moves,created_by_user_id
  )
  values(
    v_tenant_id,p_school_id,p_academic_year,p_balance_scope,v_algorithm,p_client_operation_id,
    jsonb_build_object(
      'balance_by_sex',coalesce(v_settings.balance_by_sex,true),
      'balance_by_age_group',case when v_settings.id is null then false else v_settings.balance_by_age_group end,
      'balance_by_grade',coalesce(v_settings.balance_by_grade,false),
      'age_reference_date',v_settings.age_reference_date,
      'manual_assignments_fixed',true,
      'locked_assignments_fixed',true,
      'staff_leaders_fixed',true,
      'target_houses',(
        select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name) order by h.sort_order,h.name,h.id),'[]'::jsonb)
        from public.sports_houses h where h.school_id=p_school_id and h.status='active'
      )
    ),
    v_before,v_after,v_moves,auth.uid()
  )
  returning id into v_run_id;

  insert into public.sports_house_balancing_moves(
    run_id,tenant_id,school_id,academic_year,entity_type,
    learner_id,staff_member_id,from_house_id,to_house_id,
    before_assignment_source,before_is_locked,staff_role_key,sex,age_group_id,grade_id
  )
  select
    v_run_id,v_tenant_id,p_school_id,p_academic_year,p_balance_scope,
    case when p_balance_scope='learner' then p.entity_id end,
    case when p_balance_scope='staff' then p.entity_id end,
    p.from_house_id,p.to_house_id,p.assignment_source,p.is_locked,p.staff_role_key,p.sex,p.age_group_id,p.grade_id
  from _sports_balance_proposals p
  where p.from_house_id is distinct from p.to_house_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant_id,p_school_id,auth.uid(),'sports.house_balance.previewed',
    'sports_house_balancing_run',v_run_id,
    jsonb_build_object('academic_year',p_academic_year,'scope',p_balance_scope,'algorithm_version',v_algorithm,'move_count',jsonb_array_length(v_moves))
  );

  return v_run_id;
exception
  when unique_violation then
    select id into v_run_id
    from public.sports_house_balancing_runs
    where school_id=p_school_id
      and academic_year=p_academic_year
      and balance_scope=p_balance_scope
      and client_operation_id=p_client_operation_id;
    if v_run_id is not null then return v_run_id; end if;
    raise;
end;
$$;

create or replace function public.get_sports_house_balancing_run(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_run public.sports_house_balancing_runs%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_run from public.sports_house_balancing_runs where id=p_run_id;
  if not found then raise exception 'Balancing run not found'; end if;
  if not app_private.can_manage_sports(v_run.school_id) then raise exception 'Permission denied'; end if;

  select jsonb_build_object(
    'id',v_run.id,
    'academic_year',v_run.academic_year,
    'scope',v_run.balance_scope,
    'algorithm_version',v_run.algorithm_version,
    'configuration',v_run.configuration_snapshot,
    'before_totals',v_run.before_totals,
    'after_totals',v_run.after_totals,
    'status',v_run.status,
    'created_at',v_run.created_at,
    'applied_at',v_run.applied_at,
    'move_count',(select count(*) from public.sports_house_balancing_moves m where m.run_id=v_run.id),
    'moves',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,
        'entity_type',m.entity_type,
        'entity_id',coalesce(m.learner_id,m.staff_member_id),
        'name',case when m.entity_type='learner'
          then concat_ws(' ',l.first_names,l.surname)
          else concat_ws(' ',s.first_name,s.last_name) end,
        'from_house_id',m.from_house_id,
        'from_house_name',fh.name,
        'to_house_id',m.to_house_id,
        'to_house_name',th.name,
        'assignment_source',m.before_assignment_source,
        'is_locked',coalesce(m.before_is_locked,false),
        'staff_role_key',m.staff_role_key,
        'sex',m.sex,
        'age_group',ag.label,
        'grade',g.display_name
      ) order by
        case when m.entity_type='learner' then concat_ws(' ',l.first_names,l.surname) else concat_ws(' ',s.first_name,s.last_name) end,
        m.id)
      from public.sports_house_balancing_moves m
      left join public.learners l on l.id=m.learner_id
      left join public.staff_members s on s.id=m.staff_member_id
      left join public.sports_houses fh on fh.id=m.from_house_id
      join public.sports_houses th on th.id=m.to_house_id
      left join public.sports_age_groups ag on ag.id=m.age_group_id
      left join public.grades g on g.id=m.grade_id
      where m.run_id=v_run.id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.apply_sports_house_balancing(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_run public.sports_house_balancing_runs%rowtype;
  v_move public.sports_house_balancing_moves%rowtype;
  v_current record;
  v_applied jsonb;
  v_actual_after jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_run
  from public.sports_house_balancing_runs
  where id=p_run_id
  for update;
  if not found then raise exception 'Balancing run not found'; end if;
  if not app_private.can_manage_sports(v_run.school_id) then raise exception 'Permission denied'; end if;

  if v_run.status='applied' then return true; end if;
  if v_run.status<>'preview' then raise exception 'Balancing run is not applicable'; end if;

  for v_move in
    select * from public.sports_house_balancing_moves where run_id=v_run.id order by id
  loop
    if v_move.entity_type='learner' then
      select a.house_id,a.assignment_source,a.is_locked into v_current
      from public.sports_learner_house_assignments a
      where a.school_id=v_run.school_id and a.academic_year=v_run.academic_year and a.learner_id=v_move.learner_id;

      if v_move.from_house_id is null then
        if found then raise exception 'Balancing preview is stale; learner assignment changed'; end if;
      else
        if not found
           or v_current.house_id is distinct from v_move.from_house_id
           or v_current.assignment_source is distinct from v_move.before_assignment_source
           or v_current.is_locked is distinct from v_move.before_is_locked
           or v_current.is_locked
           or v_current.assignment_source='manual' then
          raise exception 'Balancing preview is stale; learner assignment changed';
        end if;
      end if;
    else
      select a.house_id,a.assignment_source,a.is_locked,a.role_key into v_current
      from public.sports_staff_house_assignments a
      where a.school_id=v_run.school_id and a.academic_year=v_run.academic_year and a.staff_member_id=v_move.staff_member_id;

      if v_move.from_house_id is null then
        if found then raise exception 'Balancing preview is stale; staff assignment changed'; end if;
      else
        if not found
           or v_current.house_id is distinct from v_move.from_house_id
           or v_current.assignment_source is distinct from v_move.before_assignment_source
           or v_current.is_locked is distinct from v_move.before_is_locked
           or v_current.role_key is distinct from v_move.staff_role_key
           or v_current.is_locked
           or v_current.assignment_source='manual'
           or v_current.role_key='leader' then
          raise exception 'Balancing preview is stale; staff assignment changed';
        end if;
      end if;
    end if;
  end loop;

  for v_move in
    select * from public.sports_house_balancing_moves where run_id=v_run.id order by id
  loop
    if v_move.entity_type='learner' then
      insert into public.sports_learner_house_assignments(
        tenant_id,school_id,academic_year,learner_id,house_id,assignment_source,is_locked,assigned_by_user_id
      ) values(
        v_run.tenant_id,v_run.school_id,v_run.academic_year,v_move.learner_id,v_move.to_house_id,'automatic',false,auth.uid()
      )
      on conflict(school_id,academic_year,learner_id) do update set
        house_id=excluded.house_id,
        assignment_source='automatic',
        is_locked=false,
        assigned_by_user_id=auth.uid(),
        assigned_at=now(),
        updated_at=now();
    else
      insert into public.sports_staff_house_assignments(
        tenant_id,school_id,academic_year,staff_member_id,house_id,role_key,assignment_source,is_locked,assigned_by_user_id
      ) values(
        v_run.tenant_id,v_run.school_id,v_run.academic_year,v_move.staff_member_id,v_move.to_house_id,
        coalesce(v_move.staff_role_key,'member'),'automatic',false,auth.uid()
      )
      on conflict(school_id,academic_year,staff_member_id) do update set
        house_id=excluded.house_id,
        role_key=excluded.role_key,
        assignment_source='automatic',
        is_locked=false,
        assigned_by_user_id=auth.uid(),
        assigned_at=now(),
        updated_at=now();
    end if;
  end loop;

  if v_run.balance_scope='learner' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'house_id',h.id,'house_name',h.name,'total',
      (select count(*) from public.sports_learner_house_assignments a
       where a.school_id=v_run.school_id and a.academic_year=v_run.academic_year and a.house_id=h.id)
    ) order by h.sort_order,h.name,h.id),'[]'::jsonb)
    into v_actual_after
    from public.sports_houses h
    where h.school_id=v_run.school_id and h.status<>'archived';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'house_id',h.id,'house_name',h.name,'total',
      (select count(*) from public.sports_staff_house_assignments a
       where a.school_id=v_run.school_id and a.academic_year=v_run.academic_year and a.house_id=h.id)
    ) order by h.sort_order,h.name,h.id),'[]'::jsonb)
    into v_actual_after
    from public.sports_houses h
    where h.school_id=v_run.school_id and h.status<>'archived';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'move_id',m.id,
    'entity_type',m.entity_type,
    'entity_id',coalesce(m.learner_id,m.staff_member_id),
    'from_house_id',m.from_house_id,
    'to_house_id',m.to_house_id
  ) order by m.id),'[]'::jsonb)
  into v_applied
  from public.sports_house_balancing_moves m
  where m.run_id=v_run.id;

  update public.sports_house_balancing_runs
  set status='applied',
      after_totals=v_actual_after,
      applied_moves=v_applied,
      applied_by_user_id=auth.uid(),
      applied_at=now()
  where id=v_run.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_run.tenant_id,v_run.school_id,auth.uid(),'sports.house_balance.applied',
    'sports_house_balancing_run',v_run.id,
    jsonb_build_object(
      'academic_year',v_run.academic_year,
      'scope',v_run.balance_scope,
      'algorithm_version',v_run.algorithm_version,
      'configuration_snapshot',v_run.configuration_snapshot,
      'before_totals',v_run.before_totals,
      'after_totals',v_actual_after,
      'proposed_moves',v_run.proposed_moves,
      'applied_moves',v_applied
    )
  );

  return true;
end;
$$;



create or replace function app_private.enforce_sports_balancing_run_finality()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if tg_op='DELETE' then
    raise exception 'Sports balancing run history is immutable';
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.academic_year is distinct from old.academic_year
     or new.balance_scope is distinct from old.balance_scope
     or new.algorithm_version is distinct from old.algorithm_version
     or new.client_operation_id is distinct from old.client_operation_id
     or new.configuration_snapshot is distinct from old.configuration_snapshot
     or new.before_totals is distinct from old.before_totals
     or new.proposed_moves is distinct from old.proposed_moves
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Sports balancing run provenance is immutable';
  end if;

  if old.status='applied' then
    raise exception 'Applied sports balancing run is immutable';
  end if;

  if old.status='preview' and new.status<>'applied' then
    raise exception 'Sports balancing run may only transition from preview to applied';
  end if;

  if new.applied_by_user_id is null or new.applied_at is null then
    raise exception 'Applied sports balancing run requires actor and timestamp';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_sports_balancing_move_immutability()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  raise exception 'Sports balancing move proposal is immutable';
end;
$$;

revoke all on function app_private.enforce_sports_balancing_run_finality() from public,anon,authenticated;
revoke all on function app_private.enforce_sports_balancing_move_immutability() from public,anon,authenticated;

create trigger sports_house_balancing_run_finality_trg
before update or delete on public.sports_house_balancing_runs
for each row execute function app_private.enforce_sports_balancing_run_finality();

create trigger sports_house_balancing_move_immutability_trg
before update or delete on public.sports_house_balancing_moves
for each row execute function app_private.enforce_sports_balancing_move_immutability();

revoke all on function public.preview_sports_house_balancing(uuid,integer,text,uuid) from public,anon;
revoke all on function public.get_sports_house_balancing_run(uuid) from public,anon;
revoke all on function public.apply_sports_house_balancing(uuid) from public,anon;
grant execute on function public.preview_sports_house_balancing(uuid,integer,text,uuid) to authenticated;
grant execute on function public.get_sports_house_balancing_run(uuid) to authenticated;
grant execute on function public.apply_sports_house_balancing(uuid) to authenticated;

comment on table public.sports_house_balancing_runs is
'Preview/apply audit record for deterministic Sports & Houses assisted balancing; canonical membership remains in the existing assignment tables.';
comment on table public.sports_house_balancing_moves is
'Non-authoritative proposed move snapshot for a balancing run, used for explainable preview and stale-state validation.';
comment on function public.preview_sports_house_balancing(uuid,integer,text,uuid) is
'Creates an idempotent deterministic preview. Manual/locked assignments and staff leaders are fixed; no assignment mutation occurs.';
comment on function public.apply_sports_house_balancing(uuid) is
'Atomically applies a non-stale preview once, records automatic assignment provenance and final run/audit evidence; replay is idempotent.';
