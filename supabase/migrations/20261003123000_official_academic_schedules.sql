-- Issue #996: immutable/versioned official academic schedule snapshots.
-- Payloads are assembled from canonical ScolaPro read models in application code;
-- this table persists finalized evidence only and never recalculates marks or promotion decisions.

create table public.academic_schedule_snapshots(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  school_id uuid not null references public.schools(id),
  academic_year integer not null check(academic_year between 2000 and 2200),
  term_number smallint not null check(term_number between 1 and 6),
  schedule_type text not null check(schedule_type in(
    'term_schedule',
    'promotion_schedule',
    'retention_at_risk',
    'incomplete_results',
    'subject_failure',
    'top_achievers',
    'class_grade_summary',
    'promotion_exceptions'
  )),
  basis text not null check(basis in('official','provisional')),
  version integer not null check(version>=1),
  status text not null default 'finalized' check(status in('finalized','superseded')),
  title text not null check(char_length(btrim(title)) between 1 and 180),
  payload jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  generated_by_user_id uuid not null references auth.users(id),
  generated_at timestamptz not null default now(),
  finalized_at timestamptz not null default now(),
  supersedes_snapshot_id uuid references public.academic_schedule_snapshots(id),
  superseded_by_snapshot_id uuid references public.academic_schedule_snapshots(id),
  superseded_at timestamptz,
  supersession_reason text,
  created_at timestamptz not null default now(),
  constraint academic_schedule_supersession_reason_length_check
    check (supersession_reason is null or char_length(btrim(supersession_reason)) between 1 and 1000),
  unique(school_id,academic_year,term_number,schedule_type,basis,version)
);

alter table public.academic_schedule_snapshots
  drop constraint academic_schedule_snapshots_superseded_by_snapshot_id_fkey,
  add constraint academic_schedule_snapshots_superseded_by_snapshot_id_fkey
    foreign key(superseded_by_snapshot_id)
    references public.academic_schedule_snapshots(id)
    deferrable initially deferred;

create unique index academic_schedule_one_finalized_scope_idx
on public.academic_schedule_snapshots(
  school_id,academic_year,term_number,schedule_type,basis
)
where status='finalized';

create index academic_schedule_history_idx
on public.academic_schedule_snapshots(
  school_id,academic_year,term_number,schedule_type,basis,version desc
);

alter table public.academic_schedule_snapshots enable row level security;

create policy academic_schedule_snapshots_select
on public.academic_schedule_snapshots
for select
to authenticated
using(
  app_private.user_current_school_matches(auth.uid(),school_id)
  and app_private.has_school_local_role(
    school_id,
    array['school_admin','principal','deputy_principal']
  )
);

revoke insert,update,delete on public.academic_schedule_snapshots from authenticated,anon;
grant select on public.academic_schedule_snapshots to authenticated;

create or replace function app_private.guard_academic_schedule_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $schedule_immutability$
begin
  if tg_op='DELETE' then
    raise exception 'Finalized academic schedule snapshots are immutable';
  end if;

  if old.status='superseded' then
    raise exception 'Superseded academic schedule snapshots are immutable';
  end if;

  if old.status='finalized' then
    if new.status<>'superseded'
       or new.id<>old.id
       or new.tenant_id<>old.tenant_id
       or new.school_id<>old.school_id
       or new.academic_year<>old.academic_year
       or new.term_number<>old.term_number
       or new.schedule_type<>old.schedule_type
       or new.basis<>old.basis
       or new.version<>old.version
       or new.title<>old.title
       or new.payload<>old.payload
       or new.metadata<>old.metadata
       or new.generated_by_user_id<>old.generated_by_user_id
       or new.generated_at<>old.generated_at
       or new.finalized_at<>old.finalized_at
       or new.supersedes_snapshot_id is distinct from old.supersedes_snapshot_id
       or new.created_at<>old.created_at
       or new.superseded_by_snapshot_id is null
       or new.superseded_at is null
       or nullif(btrim(coalesce(new.supersession_reason,'')),'') is null then
      raise exception 'Finalized academic schedule snapshots are immutable';
    end if;
  end if;

  return new;
end;
$schedule_immutability$;

revoke all on function app_private.guard_academic_schedule_snapshot_immutability()
from public,anon,authenticated;

create trigger academic_schedule_snapshot_immutability_trg
before update or delete on public.academic_schedule_snapshots
for each row execute function app_private.guard_academic_schedule_snapshot_immutability();

create or replace function public.finalize_academic_schedule_snapshot(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number smallint,
  p_schedule_type text,
  p_basis text,
  p_title text,
  p_payload jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_supersession_reason text default null,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $finalize_schedule$
declare
  v_tenant_id uuid;
  v_existing_id uuid;
  v_next_version integer;
  v_snapshot_id uuid:=gen_random_uuid();
  v_title text:=btrim(coalesce(p_title,''));
  v_reason text:=nullif(btrim(coalesce(p_supersession_reason,'')),'');
begin
  if p_actor_user_id is null then
    raise exception 'Actor is required';
  end if;
  if p_school_id is null or p_academic_year is null or p_term_number is null then
    raise exception 'School, academic year and term are required';
  end if;
  if p_academic_year not between 2000 and 2200 or p_term_number not between 1 and 6 then
    raise exception 'Academic schedule scope is invalid';
  end if;
  if p_schedule_type not in(
    'term_schedule','promotion_schedule','retention_at_risk','incomplete_results',
    'subject_failure','top_achievers','class_grade_summary','promotion_exceptions'
  ) then
    raise exception 'Unsupported academic schedule type';
  end if;
  if p_basis<>'official' then
    raise exception 'Only official-basis academic schedules may be finalized';
  end if;
  if char_length(v_title)<1 or char_length(v_title)>180 then
    raise exception 'Academic schedule title is invalid';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'Academic schedule payload is required';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception 'Academic schedule metadata must be an object';
  end if;
  if p_payload->>'scheduleType' is distinct from p_schedule_type
     or p_payload->>'basis' is distinct from p_basis
     or nullif(p_payload->>'academicYear','')::integer is distinct from p_academic_year
     or nullif(p_payload->>'termNumber','')::smallint is distinct from p_term_number
     or p_payload->>'title' is distinct from v_title
     or jsonb_typeof(p_payload->'columns')<>'array'
     or jsonb_typeof(p_payload->'rows')<>'array'
     or coalesce((p_payload->>'rowCount')::integer,-1)<>jsonb_array_length(p_payload->'rows') then
    raise exception 'Academic schedule payload does not match its governed scope';
  end if;
  if not exists(
    select 1
    from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.user_id=p_actor_user_id
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  ) then
    raise exception 'Permission denied';
  end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':',p_school_id::text,p_academic_year::text,p_term_number::text,p_schedule_type,p_basis),
      0
    )
  );

  select id into v_existing_id
  from public.academic_schedule_snapshots
  where school_id=p_school_id
    and academic_year=p_academic_year
    and term_number=p_term_number
    and schedule_type=p_schedule_type
    and basis=p_basis
    and status='finalized'
  for update;

  if v_existing_id is null and v_reason is not null then
    raise exception 'Supersession reason is only valid when replacing an issued schedule';
  end if;
  if v_existing_id is not null and v_reason is null then
    raise exception 'A supersession reason is required when replacing an issued schedule';
  end if;

  select coalesce(max(version),0)+1 into v_next_version
  from public.academic_schedule_snapshots
  where school_id=p_school_id
    and academic_year=p_academic_year
    and term_number=p_term_number
    and schedule_type=p_schedule_type
    and basis=p_basis;

  if v_existing_id is not null then
    update public.academic_schedule_snapshots
    set status='superseded',
        superseded_by_snapshot_id=v_snapshot_id,
        superseded_at=now(),
        supersession_reason=v_reason
    where id=v_existing_id;
  end if;

  insert into public.academic_schedule_snapshots(
    id,tenant_id,school_id,academic_year,term_number,schedule_type,basis,version,
    status,title,payload,metadata,generated_by_user_id,supersedes_snapshot_id
  ) values(
    v_snapshot_id,v_tenant_id,p_school_id,p_academic_year,p_term_number,p_schedule_type,p_basis,v_next_version,
    'finalized',v_title,p_payload,coalesce(p_metadata,'{}'::jsonb),p_actor_user_id,v_existing_id
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant_id,p_school_id,p_actor_user_id,
    'academic_schedule_finalized',
    'academic_schedule_snapshots',
    v_snapshot_id,
    jsonb_build_object(
      'academic_year',p_academic_year,
      'term_number',p_term_number,
      'schedule_type',p_schedule_type,
      'basis',p_basis,
      'version',v_next_version,
      'supersedes_snapshot_id',v_existing_id,
      'supersession_reason',v_reason
    )
  );

  return v_snapshot_id;
end;
$finalize_schedule$;

revoke all on function public.finalize_academic_schedule_snapshot(
  uuid,integer,smallint,text,text,text,jsonb,jsonb,text,uuid
) from public,anon,authenticated;
grant execute on function public.finalize_academic_schedule_snapshot(
  uuid,integer,smallint,text,text,text,jsonb,jsonb,text,uuid
) to service_role;

comment on function public.finalize_academic_schedule_snapshot(
  uuid,integer,smallint,text,text,text,jsonb,jsonb,text,uuid
) is
'Trusted server-only finalization boundary for canonical academic schedule payloads. Direct authenticated client execution is revoked; the supplied actor is independently checked against current school-management membership.';

comment on table public.academic_schedule_snapshots is
'Immutable version history for finalized official academic schedule evidence. Payloads originate from canonical results, assessment readiness and promotion-readiness read models; this table is not a parallel results engine.';
