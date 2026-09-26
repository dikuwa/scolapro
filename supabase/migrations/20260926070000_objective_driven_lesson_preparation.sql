-- Issue #682: objective-driven, reusable multi-session Lesson Preparation.
--
-- Evolves the canonical lesson_preparations record rather than introducing a
-- second preparation store. Preparation content is now explicitly bound to
-- the curriculum unit / subject offering and selected competencies, while
-- delivery remains schedule/group-specific through a separate relation.
-- teaching_actuals remains the authoritative record of what was actually
-- taught and therefore owns per-delivery completion/reflection.

alter table public.lesson_preparations
  add column if not exists academic_year integer,
  add column if not exists subject_offering_id uuid references public.subject_offerings(id) on delete restrict,
  add column if not exists curriculum_unit_id uuid references public.curriculum_units(id) on delete restrict,
  add column if not exists curriculum_version_id uuid references public.curriculum_versions(id) on delete restrict,
  add column if not exists selected_competency_ids uuid[] not null default '{}'::uuid[],
  add column if not exists session_count smallint not null default 1
    check (session_count between 1 and 30);

update public.lesson_preparations lp
set academic_year = tsi.academic_year,
    subject_offering_id = ta.subject_offering_id,
    curriculum_unit_id = ppi.curriculum_unit_id,
    curriculum_version_id = cu.curriculum_version_id
from public.teaching_schedule_items tsi
join public.teacher_allocations ta on ta.id = tsi.teacher_allocation_id
join public.pacing_plan_items ppi on ppi.id = tsi.pacing_plan_item_id
join public.curriculum_units cu on cu.id = ppi.curriculum_unit_id
where tsi.id = lp.teaching_schedule_item_id
  and (
    lp.academic_year is null
    or lp.subject_offering_id is null
    or lp.curriculum_unit_id is null
    or lp.curriculum_version_id is null
  );

create table if not exists public.lesson_preparation_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  lesson_preparation_id uuid not null references public.lesson_preparations(id) on delete restrict,
  teaching_schedule_item_id uuid not null references public.teaching_schedule_items(id) on delete restrict,
  teaching_group_id uuid references public.teaching_groups(id) on delete restrict,
  session_number smallint not null default 1 check (session_number between 1 and 30),
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (teaching_schedule_item_id),
  unique (lesson_preparation_id, teaching_schedule_item_id)
);

create index if not exists lesson_preparation_deliveries_preparation_idx
  on public.lesson_preparation_deliveries(lesson_preparation_id, session_number);
create index if not exists lesson_preparation_deliveries_group_idx
  on public.lesson_preparation_deliveries(teaching_group_id, teaching_schedule_item_id)
  where teaching_group_id is not null;

alter table public.lesson_preparation_deliveries enable row level security;

create or replace function app_private.enforce_objective_lesson_preparation_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule record;
  v_bad_competency uuid;
begin
  select tsi.tenant_id, tsi.school_id, tsi.academic_year,
         ta.subject_offering_id, ppi.curriculum_unit_id,
         cu.curriculum_version_id
    into v_schedule
    from public.teaching_schedule_items tsi
    join public.teacher_allocations ta on ta.id = tsi.teacher_allocation_id
    join public.pacing_plan_items ppi on ppi.id = tsi.pacing_plan_item_id
    join public.curriculum_units cu on cu.id = ppi.curriculum_unit_id
   where tsi.id = new.teaching_schedule_item_id;

  -- Some historical regression fixtures deliberately seed a minimal schedule
  -- graph with replication guards disabled. Preserve those fixtures while
  -- requiring complete objective binding whenever the canonical graph exists.
  if found then
    if (new.tenant_id,new.school_id) is distinct from
       (v_schedule.tenant_id,v_schedule.school_id) then
      raise exception 'Lesson preparation scope mismatch: teaching schedule differs';
    end if;

    if new.academic_year is null then new.academic_year := v_schedule.academic_year; end if;
    if new.subject_offering_id is null then new.subject_offering_id := v_schedule.subject_offering_id; end if;
    if new.curriculum_unit_id is null then new.curriculum_unit_id := v_schedule.curriculum_unit_id; end if;
    if new.curriculum_version_id is null then new.curriculum_version_id := v_schedule.curriculum_version_id; end if;

    if row(new.academic_year,new.subject_offering_id,new.curriculum_unit_id,new.curriculum_version_id)
       is distinct from
       row(v_schedule.academic_year,v_schedule.subject_offering_id,v_schedule.curriculum_unit_id,v_schedule.curriculum_version_id) then
      raise exception 'Lesson preparation curriculum binding does not match its anchor schedule';
    end if;
  end if;

  if array_length(new.selected_competency_ids,1) is not null then
    select selected_id into v_bad_competency
    from unnest(new.selected_competency_ids) selected_id
    where not exists (
      select 1
      from public.curriculum_competencies cc
      where cc.id = selected_id
        and cc.curriculum_unit_id = new.curriculum_unit_id
    )
    limit 1;

    if v_bad_competency is not null then
      raise exception 'Selected lesson competency does not belong to the preparation curriculum unit';
    end if;
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.subject_offering_id is distinct from old.subject_offering_id
    or new.curriculum_unit_id is distinct from old.curriculum_unit_id
    or new.curriculum_version_id is distinct from old.curriculum_version_id
    or new.prepared_by_user_id is distinct from old.prepared_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Lesson preparation curriculum identity and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_objective_lesson_preparation_integrity()
  from public, anon, authenticated;

drop trigger if exists objective_lesson_preparation_integrity_trg
  on public.lesson_preparations;
create trigger objective_lesson_preparation_integrity_trg
before insert or update on public.lesson_preparations
for each row execute function app_private.enforce_objective_lesson_preparation_integrity();

create or replace function app_private.enforce_lesson_preparation_delivery_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preparation record;
  v_schedule record;
  v_group record;
begin
  select lp.tenant_id,lp.school_id,lp.academic_year,lp.subject_offering_id,
         lp.curriculum_unit_id,lp.session_count,lp.prepared_by_user_id
    into v_preparation
    from public.lesson_preparations lp
   where lp.id = new.lesson_preparation_id;

  select tsi.tenant_id,tsi.school_id,tsi.academic_year,tsi.teacher_allocation_id,
         tsi.planned_on,ta.subject_offering_id,ppi.curriculum_unit_id
    into v_schedule
    from public.teaching_schedule_items tsi
    join public.teacher_allocations ta on ta.id=tsi.teacher_allocation_id
    join public.pacing_plan_items ppi on ppi.id=tsi.pacing_plan_item_id
   where tsi.id=new.teaching_schedule_item_id;

  if v_preparation.tenant_id is null or v_schedule.tenant_id is null then
    raise exception 'Lesson preparation delivery requires canonical preparation and schedule';
  end if;

  if row(new.tenant_id,new.school_id,v_schedule.academic_year,v_schedule.subject_offering_id,v_schedule.curriculum_unit_id)
     is distinct from
     row(v_preparation.tenant_id,v_preparation.school_id,v_preparation.academic_year,v_preparation.subject_offering_id,v_preparation.curriculum_unit_id) then
    raise exception 'Lesson preparation delivery scope or curriculum does not match the reusable preparation';
  end if;

  if new.session_number > v_preparation.session_count then
    raise exception 'Lesson preparation delivery session exceeds the preparation session count';
  end if;

  if new.teaching_group_id is null then
    select (array_agg(tga.teaching_group_id order by tga.created_at))[1]
      into new.teaching_group_id
      from public.teaching_group_allocations tga
      join public.teaching_groups tg on tg.id=tga.teaching_group_id
      where tga.teacher_allocation_id=v_schedule.teacher_allocation_id
        and tga.effective_from<=v_schedule.planned_on
        and (tga.effective_to is null or tga.effective_to>=v_schedule.planned_on)
        and tg.status='active'
        and tg.effective_from<=v_schedule.planned_on
        and (tg.effective_to is null or tg.effective_to>=v_schedule.planned_on)
      having count(*)=1;
  end if;

  if new.teaching_group_id is not null then
    select tg.tenant_id,tg.school_id,tg.academic_year,tg.subject_offering_id
      into v_group
      from public.teaching_groups tg
     where tg.id=new.teaching_group_id;

    if v_group.tenant_id is null
       or row(v_group.tenant_id,v_group.school_id,v_group.academic_year,v_group.subject_offering_id)
          is distinct from
          row(new.tenant_id,new.school_id,v_schedule.academic_year,v_schedule.subject_offering_id)
       or not exists (
         select 1
         from public.teaching_group_allocations tga
         where tga.teaching_group_id=new.teaching_group_id
           and tga.teacher_allocation_id=v_schedule.teacher_allocation_id
           and tga.effective_from<=v_schedule.planned_on
           and (tga.effective_to is null or tga.effective_to>=v_schedule.planned_on)
       ) then
      raise exception 'Lesson preparation delivery teaching group does not match the scheduled allocation';
    end if;
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.lesson_preparation_id is distinct from old.lesson_preparation_id
    or new.teaching_schedule_item_id is distinct from old.teaching_schedule_item_id
    or new.assigned_by_user_id is distinct from old.assigned_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Lesson preparation delivery identity and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_lesson_preparation_delivery_integrity()
  from public, anon, authenticated;

drop trigger if exists lesson_preparation_delivery_integrity_trg
  on public.lesson_preparation_deliveries;
create trigger lesson_preparation_delivery_integrity_trg
before insert or update on public.lesson_preparation_deliveries
for each row execute function app_private.enforce_lesson_preparation_delivery_integrity();

create or replace function app_private.ensure_lesson_preparation_anchor_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Legacy/minimal test or historical rows may not yet resolve the newer
  -- curriculum binding. Preserve them without fabricating a reusable delivery;
  -- canonical server writes populate these fields and therefore receive the
  -- anchor relation automatically.
  if new.academic_year is null
     or new.subject_offering_id is null
     or new.curriculum_unit_id is null
     or new.curriculum_version_id is null then
    return new;
  end if;

  insert into public.lesson_preparation_deliveries(
    tenant_id,school_id,lesson_preparation_id,teaching_schedule_item_id,
    teaching_group_id,session_number,assigned_by_user_id
  )
  values(
    new.tenant_id,new.school_id,new.id,new.teaching_schedule_item_id,
    null,1,new.prepared_by_user_id
  )
  on conflict (teaching_schedule_item_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.ensure_lesson_preparation_anchor_delivery()
  from public, anon, authenticated;

drop trigger if exists lesson_preparation_anchor_delivery_trg
  on public.lesson_preparations;
create trigger lesson_preparation_anchor_delivery_trg
after insert on public.lesson_preparations
for each row execute function app_private.ensure_lesson_preparation_anchor_delivery();

insert into public.lesson_preparation_deliveries(
  tenant_id,school_id,lesson_preparation_id,teaching_schedule_item_id,
  teaching_group_id,session_number,assigned_by_user_id
)
select lp.tenant_id,lp.school_id,lp.id,lp.teaching_schedule_item_id,
       null,1,lp.prepared_by_user_id
from public.lesson_preparations lp
where not exists (
  select 1 from public.lesson_preparation_deliveries lpd
  where lpd.teaching_schedule_item_id=lp.teaching_schedule_item_id
);

create policy "scoped staff can read lesson preparation deliveries"
on public.lesson_preparation_deliveries for select to authenticated
using (
  exists (
    select 1
    from public.teaching_schedule_items tsi
    where tsi.id=lesson_preparation_deliveries.teaching_schedule_item_id
      and app_private.can_access_teaching_plan(tsi.school_id,tsi.teacher_allocation_id)
  )
);

create policy "preparation owner can assign reusable deliveries"
on public.lesson_preparation_deliveries for insert to authenticated
with check (
  assigned_by_user_id=(select auth.uid())
  and exists (
    select 1
    from public.lesson_preparations lp
    join public.teaching_schedule_items tsi on tsi.id=lesson_preparation_deliveries.teaching_schedule_item_id
    where lp.id=lesson_preparation_deliveries.lesson_preparation_id
      and lp.prepared_by_user_id=(select auth.uid())
      and app_private.user_current_school_matches((select auth.uid()),lp.school_id)
      and app_private.can_access_teaching_plan(tsi.school_id,tsi.teacher_allocation_id)
  )
);

revoke all on public.lesson_preparation_deliveries from anon;
grant select,insert on public.lesson_preparation_deliveries to authenticated;

comment on table public.lesson_preparation_deliveries is
'Schedule/group delivery assignments for one reusable canonical lesson preparation. When a schedule resolves unambiguously through teaching_group_allocations, the canonical Teaching Group is captured automatically. Actual completion/reflection remains authoritative in teaching_actuals.';
comment on column public.lesson_preparations.selected_competency_ids is
'Teacher-selected binding basic/specific competencies for this preparation. General objectives remain contextual curriculum snapshot data.';
comment on column public.lesson_preparations.session_count is
'Number of planned sessions in the reusable preparation; each linked delivery chooses a session_number.';

-- Upgrade the existing offline RPC without changing its public signature.
-- Selected competency IDs and session count travel inside the governed
-- curriculum snapshot so older queued payloads remain replay-compatible.
create or replace function public.save_lesson_preparation_offline_draft(
  p_schedule_id uuid,
  p_preparation jsonb,
  p_curriculum_snapshot jsonb,
  p_client_mutation_id uuid,
  p_expected_updated_at timestamptz default null
)
returns table(lesson_preparation_id uuid, preparation_status text, preparation_updated_at timestamptz, replayed boolean)
language plpgsql security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare
  v_schedule public.teaching_schedule_items%rowtype;
  v_existing public.lesson_preparations%rowtype;
  v_lesson_date date;
  v_selected uuid[];
  v_sessions smallint;
begin
  if auth.uid() is null or p_client_mutation_id is null then
    raise exception 'Authentication and mutation identity are required';
  end if;

  select * into v_schedule from public.teaching_schedule_items where id=p_schedule_id for share;
  if not found then raise exception 'The scheduled lesson is no longer available'; end if;
  v_lesson_date := coalesce(v_schedule.moved_to_date,v_schedule.planned_on);

  if not app_private.user_current_school_matches(auth.uid(),v_schedule.school_id)
     or not exists (
       select 1
       from public.teacher_allocations ta
       join public.staff_members st on st.id=ta.staff_member_id and st.user_id=auth.uid() and st.status='active'
       join public.school_memberships sm on sm.school_id=ta.school_id and sm.staff_member_id=ta.staff_member_id
         and sm.user_id=auth.uid() and sm.role_key in ('teacher','class_teacher')
         and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
       where ta.id=v_schedule.teacher_allocation_id
         and ta.tenant_id=v_schedule.tenant_id and ta.school_id=v_schedule.school_id
         and ta.active_from<=v_lesson_date and (ta.active_to is null or ta.active_to>=v_lesson_date)
     ) then
    raise exception 'Current teacher allocation authority is required';
  end if;

  select lp.* into v_existing
  from public.lesson_preparation_deliveries lpd
  join public.lesson_preparations lp on lp.id=lpd.lesson_preparation_id
  where lpd.teaching_schedule_item_id=p_schedule_id
  for update of lp;

  if v_existing.id is null then
    select * into v_existing
    from public.lesson_preparations
    where teaching_schedule_item_id=p_schedule_id
    for update;
  end if;

  v_selected := coalesce(
    array(
      select value::uuid
      from jsonb_array_elements_text(coalesce(p_curriculum_snapshot->'selectedCompetencyIds','[]'::jsonb))
    ),
    '{}'::uuid[]
  );
  v_sessions := greatest(1,least(30,coalesce((p_curriculum_snapshot->>'sessionCount')::smallint,1)));

  if v_existing.id is not null and v_existing.offline_client_mutation_id=p_client_mutation_id then
    if v_existing.preparation is distinct from coalesce(p_preparation,'{}'::jsonb)
       or v_existing.selected_competency_ids is distinct from v_selected
       or v_existing.session_count is distinct from v_sessions then
      raise exception 'Client mutation ID was already used with different lesson preparation data';
    end if;
    return query select v_existing.id,v_existing.status,v_existing.updated_at,true;
    return;
  end if;

  if v_existing.id is not null and v_existing.status <> 'draft' then
    raise exception 'This preparation is no longer an editable draft';
  end if;
  if v_existing.id is not null
     and (p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at) then
    raise exception 'The server draft changed while this device was offline';
  end if;

  if v_existing.id is null then
    insert into public.lesson_preparations(
      tenant_id,school_id,teaching_schedule_item_id,planned_on,curriculum_snapshot,
      preparation,status,prepared_by_user_id,offline_client_mutation_id,
      selected_competency_ids,session_count
    ) values(
      v_schedule.tenant_id,v_schedule.school_id,v_schedule.id,v_lesson_date,
      coalesce(p_curriculum_snapshot,'{}'::jsonb),coalesce(p_preparation,'{}'::jsonb),
      'draft',auth.uid(),p_client_mutation_id,v_selected,v_sessions
    )
    returning id,status,updated_at
      into lesson_preparation_id,preparation_status,preparation_updated_at;
  else
    update public.lesson_preparations
       set preparation=coalesce(p_preparation,'{}'::jsonb),
           curriculum_snapshot=coalesce(p_curriculum_snapshot,v_existing.curriculum_snapshot),
           selected_competency_ids=v_selected,
           session_count=v_sessions,
           offline_client_mutation_id=p_client_mutation_id,
           updated_at=now()
     where id=v_existing.id
     returning id,status,updated_at
       into lesson_preparation_id,preparation_status,preparation_updated_at;
  end if;

  replayed := false;
  return next;
end;
$$;

revoke all on function public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)
  from public,anon;
grant execute on function public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz)
  to authenticated;
