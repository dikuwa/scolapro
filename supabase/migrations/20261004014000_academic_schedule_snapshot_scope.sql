-- Issue #1045: distinguish finalized academic documents by their visible grade,
-- class and period scope. This extends snapshot identity only; canonical results
-- and promotion decisions remain in their existing governed stores.

alter table public.academic_schedule_snapshots
  add column scope_key text not null default 'period:term|grade:all|classes:all'
  check (char_length(btrim(scope_key)) between 1 and 1000);

alter table public.academic_schedule_snapshots
  drop constraint academic_schedule_snapshots_schedule_type_check,
  add constraint academic_schedule_snapshots_schedule_type_check check(schedule_type in(
    'term_schedule','promotion_schedule','promotion_all_terms','retention_at_risk',
    'incomplete_results','subject_failure','top_achievers','class_grade_summary','promotion_exceptions'
  ));

do $drop_legacy_snapshot_unique$
declare v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid='public.academic_schedule_snapshots'::regclass
    and contype='u'
    and pg_get_constraintdef(oid) like 'UNIQUE (school_id, academic_year, term_number, schedule_type, basis, version)%';
  if v_name is not null then execute format('alter table public.academic_schedule_snapshots drop constraint %I',v_name); end if;
end;
$drop_legacy_snapshot_unique$;

drop index public.academic_schedule_one_finalized_scope_idx;
drop index public.academic_schedule_history_idx;

alter table public.academic_schedule_snapshots
  add constraint academic_schedule_snapshot_scope_version_key
  unique(school_id,academic_year,term_number,schedule_type,basis,scope_key,version);

create unique index academic_schedule_one_finalized_scope_idx
on public.academic_schedule_snapshots(
  school_id,academic_year,term_number,schedule_type,basis,scope_key
)
where status='finalized';

create index academic_schedule_history_idx
on public.academic_schedule_snapshots(
  school_id,academic_year,term_number,schedule_type,basis,scope_key,version desc
);

create or replace function app_private.guard_academic_schedule_snapshot_scope()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $guard_snapshot_scope$
begin
  if new.scope_key is distinct from old.scope_key then
    raise exception 'Finalized academic schedule snapshot scope is immutable';
  end if;
  return new;
end;
$guard_snapshot_scope$;
revoke all on function app_private.guard_academic_schedule_snapshot_scope() from public,anon,authenticated;
create trigger academic_schedule_snapshot_scope_immutability_trg
before update on public.academic_schedule_snapshots
for each row execute function app_private.guard_academic_schedule_snapshot_scope();

create or replace function public.finalize_academic_schedule_snapshot(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number smallint,
  p_schedule_type text,
  p_basis text,
  p_title text,
  p_payload jsonb,
  p_scope_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_supersession_reason text default null,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $finalize_scoped_schedule$
declare
  v_tenant_id uuid;
  v_existing_id uuid;
  v_next_version integer;
  v_snapshot_id uuid:=gen_random_uuid();
  v_title text:=btrim(coalesce(p_title,''));
  v_reason text:=nullif(btrim(coalesce(p_supersession_reason,'')),'');
  v_scope_key text:=btrim(coalesce(p_scope_key,''));
begin
  if p_actor_user_id is null then raise exception 'Actor is required'; end if;
  if p_school_id is null or p_academic_year is null or p_term_number is null then raise exception 'School, academic year and term anchor are required'; end if;
  if p_academic_year not between 2000 and 2200 or p_term_number not between 1 and 6 then raise exception 'Academic schedule scope is invalid'; end if;
  if p_schedule_type not in(
    'term_schedule','promotion_schedule','promotion_all_terms','retention_at_risk',
    'incomplete_results','subject_failure','top_achievers','class_grade_summary','promotion_exceptions'
  ) then raise exception 'Unsupported academic schedule type'; end if;
  if p_basis<>'official' then raise exception 'Only official-basis academic schedules may be finalized'; end if;
  if char_length(v_title)<1 or char_length(v_title)>180 then raise exception 'Academic schedule title is invalid'; end if;
  if char_length(v_scope_key)<1 or char_length(v_scope_key)>1000 then raise exception 'Academic schedule snapshot scope is invalid'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Academic schedule payload is required'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then raise exception 'Academic schedule metadata must be an object'; end if;
  if p_payload->>'scheduleType' is distinct from p_schedule_type
     or p_payload->>'basis' is distinct from p_basis
     or nullif(p_payload->>'academicYear','')::integer is distinct from p_academic_year
     or nullif(p_payload->>'termNumber','')::smallint is distinct from p_term_number
     or p_payload->>'title' is distinct from v_title
     or p_payload->>'scopeKey' is distinct from v_scope_key
     or jsonb_typeof(p_payload->'columns')<>'array'
     or jsonb_typeof(p_payload->'rows')<>'array'
     or coalesce((p_payload->>'rowCount')::integer,-1)<>jsonb_array_length(p_payload->'rows') then
    raise exception 'Academic schedule payload does not match its governed scope';
  end if;
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.user_id=p_actor_user_id
      and sm.role_key in('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date and(sm.active_to is null or sm.active_to>=current_date)
  ) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',p_school_id::text,p_academic_year::text,p_term_number::text,p_schedule_type,p_basis,v_scope_key),0));

  select id into v_existing_id
  from public.academic_schedule_snapshots
  where school_id=p_school_id and academic_year=p_academic_year and term_number=p_term_number
    and schedule_type=p_schedule_type and basis=p_basis and scope_key=v_scope_key and status='finalized'
  for update;
  if v_existing_id is null and v_reason is not null then raise exception 'Supersession reason is only valid when replacing an issued schedule'; end if;
  if v_existing_id is not null and v_reason is null then raise exception 'A supersession reason is required when replacing an issued schedule'; end if;

  select coalesce(max(version),0)+1 into v_next_version
  from public.academic_schedule_snapshots
  where school_id=p_school_id and academic_year=p_academic_year and term_number=p_term_number
    and schedule_type=p_schedule_type and basis=p_basis and scope_key=v_scope_key;

  if v_existing_id is not null then
    update public.academic_schedule_snapshots
    set status='superseded',superseded_by_snapshot_id=v_snapshot_id,superseded_at=now(),supersession_reason=v_reason
    where id=v_existing_id;
  end if;

  insert into public.academic_schedule_snapshots(
    id,tenant_id,school_id,academic_year,term_number,schedule_type,basis,scope_key,version,
    status,title,payload,metadata,generated_by_user_id,supersedes_snapshot_id
  ) values(
    v_snapshot_id,v_tenant_id,p_school_id,p_academic_year,p_term_number,p_schedule_type,p_basis,v_scope_key,v_next_version,
    'finalized',v_title,p_payload,p_metadata,p_actor_user_id,v_existing_id
  );

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,p_actor_user_id,'academic_schedule_finalized','academic_schedule_snapshots',v_snapshot_id,
    jsonb_build_object('academic_year',p_academic_year,'term_number',p_term_number,'schedule_type',p_schedule_type,
      'basis',p_basis,'scope_key',v_scope_key,'version',v_next_version,'supersedes_snapshot_id',v_existing_id,'supersession_reason',v_reason));
  return v_snapshot_id;
end;
$finalize_scoped_schedule$;

revoke all on function public.finalize_academic_schedule_snapshot(
  uuid,integer,smallint,text,text,text,jsonb,text,jsonb,text,uuid
) from public,anon,authenticated;
grant execute on function public.finalize_academic_schedule_snapshot(
  uuid,integer,smallint,text,text,text,jsonb,text,jsonb,text,uuid
) to service_role;

comment on column public.academic_schedule_snapshots.scope_key is
'Immutable visible document scope (period, grade and selected classes); prevents unrelated official schedule issues from superseding each other.';
