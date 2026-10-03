-- Issue #1001: Staff Leave + Absence management foundation.
-- Policy values are intentionally not seeded. Leave balances are immutable-ledger derived.

create table public.staff_leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  code text not null,
  display_name text not null,
  description text,
  tracks_balance boolean not null default false,
  evidence_requirement text not null default 'optional'
    check (evidence_requirement in ('none','optional','required')),
  source_reference text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,code),
  check (btrim(code)<>''),
  check (btrim(display_name)<>'')
);

create table public.staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  leave_type_id uuid not null references public.staff_leave_types(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  requested_units numeric(8,2) not null check (requested_units>0),
  approved_units numeric(8,2),
  reason text,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected','cancelled')),
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  decided_by_user_id uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  decision_note text,
  cancelled_by_user_id uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on>=starts_on),
  check (approved_units is null or approved_units>0),
  check (
    (status in ('submitted','cancelled'))
    or
    (status in ('approved','rejected') and decided_by_user_id is not null and decided_at is not null)
  ),
  check (
    status<>'approved'
    or approved_units is not null
  )
);

create table public.staff_leave_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  leave_type_id uuid not null references public.staff_leave_types(id) on delete restrict,
  leave_request_id uuid references public.staff_leave_requests(id) on delete restrict,
  entry_kind text not null check (entry_kind in ('opening','accrual','adjustment','debit','reversal')),
  units_delta numeric(8,2) not null check (units_delta<>0),
  effective_on date not null,
  note text,
  source_reference text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    entry_kind in ('debit','reversal')
    or btrim(coalesce(source_reference,''))<>''
  )
);

create unique index staff_leave_ledger_request_debit_uidx
  on public.staff_leave_ledger_entries(leave_request_id,entry_kind)
  where leave_request_id is not null and entry_kind in ('debit','reversal');

create table public.staff_absences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  leave_request_id uuid unique references public.staff_leave_requests(id) on delete restrict,
  absence_kind text not null default 'approved_leave'
    check (absence_kind in ('approved_leave','other')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active','cancelled')),
  operational_note text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  cancelled_by_user_id uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on>=starts_on),
  check (
    status='active'
    or (cancelled_by_user_id is not null and cancelled_at is not null)
  )
);

create table public.staff_leave_request_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  leave_request_id uuid not null references public.staff_leave_requests(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes>0 and file_size_bytes<=10485760),
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (leave_request_id,storage_path),
  check (btrim(storage_path)<>''),
  check (btrim(file_name)<>'')
);

create index staff_leave_types_school_status_idx
  on public.staff_leave_types(school_id,status,display_name);
create index staff_leave_requests_school_status_dates_idx
  on public.staff_leave_requests(school_id,status,starts_on,ends_on,staff_member_id);
create index staff_leave_requests_staff_dates_idx
  on public.staff_leave_requests(staff_member_id,starts_on desc,ends_on desc);
create index staff_leave_ledger_staff_type_date_idx
  on public.staff_leave_ledger_entries(staff_member_id,leave_type_id,effective_on,id);
create index staff_absences_school_dates_idx
  on public.staff_absences(school_id,status,starts_on,ends_on,staff_member_id);
create index staff_leave_attachments_request_idx
  on public.staff_leave_request_attachments(leave_request_id,created_at);

alter table public.staff_leave_types enable row level security;
alter table public.staff_leave_requests enable row level security;
alter table public.staff_leave_ledger_entries enable row level security;
alter table public.staff_absences enable row level security;
alter table public.staff_leave_request_attachments enable row level security;

create or replace function app_private.staff_leave_actor_staff_member(p_school_id uuid)
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select sm.staff_member_id
  from public.school_memberships sm
  where sm.school_id=p_school_id
    and sm.user_id=auth.uid()
    and sm.staff_member_id is not null
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
  order by sm.active_from desc,sm.id
  limit 1;
$$;
revoke all on function app_private.staff_leave_actor_staff_member(uuid) from public,anon,authenticated;

create or replace function app_private.can_manage_staff_leave(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select auth.uid() is not null
    and (
      app_private.has_platform_role(array['platform_admin'])
      or app_private.has_school_role(
        p_school_id,
        array['school_admin','principal','deputy_principal']
      )
    );
$$;
revoke all on function app_private.can_manage_staff_leave(uuid) from public,anon,authenticated;

create or replace function app_private.can_view_staff_leave(
  p_school_id uuid,
  p_staff_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select auth.uid() is not null
    and (
      app_private.can_manage_staff_leave(p_school_id)
      or app_private.staff_leave_actor_staff_member(p_school_id)=p_staff_member_id
    );
$$;
revoke all on function app_private.can_view_staff_leave(uuid,uuid) from public,anon,authenticated;

create policy "school members read leave types"
on public.staff_leave_types for select to authenticated
using (
  app_private.has_school_access(school_id)
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "authorized users read leave requests"
on public.staff_leave_requests for select to authenticated
using (app_private.can_view_staff_leave(school_id,staff_member_id));

create policy "authorized users read leave ledger"
on public.staff_leave_ledger_entries for select to authenticated
using (app_private.can_view_staff_leave(school_id,staff_member_id));

create policy "authorized users read staff absences"
on public.staff_absences for select to authenticated
using (app_private.can_view_staff_leave(school_id,staff_member_id));

create policy "authorized users read leave attachments"
on public.staff_leave_request_attachments for select to authenticated
using (
  exists(
    select 1
    from public.staff_leave_requests r
    where r.id=leave_request_id
      and app_private.can_view_staff_leave(r.school_id,r.staff_member_id)
  )
);

revoke insert,update,delete on public.staff_leave_types from authenticated;
revoke insert,update,delete on public.staff_leave_requests from authenticated;
revoke insert,update,delete on public.staff_leave_ledger_entries from authenticated;
revoke insert,update,delete on public.staff_absences from authenticated;
revoke insert,update,delete on public.staff_leave_request_attachments from authenticated;
grant select on public.staff_leave_types to authenticated;
grant select on public.staff_leave_requests to authenticated;
grant select on public.staff_leave_ledger_entries to authenticated;
grant select on public.staff_absences to authenticated;
grant select on public.staff_leave_request_attachments to authenticated;

create or replace function app_private.enforce_staff_leave_ledger_immutable()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  raise exception 'Staff leave ledger entries are immutable';
end;
$$;
revoke all on function app_private.enforce_staff_leave_ledger_immutable() from public,anon,authenticated;

create trigger staff_leave_ledger_immutable_trg
before update or delete on public.staff_leave_ledger_entries
for each row execute function app_private.enforce_staff_leave_ledger_immutable();

create or replace function app_private.enforce_staff_leave_type_rule_finality()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $
begin
  if (
    new.tracks_balance is distinct from old.tracks_balance
    or new.evidence_requirement is distinct from old.evidence_requirement
  )
  and exists(
    select 1
    from public.staff_leave_requests r
    where r.leave_type_id=old.id
  ) then
    raise exception 'Leave type rule semantics are final once requests exist';
  end if;
  return new;
end;
$;
revoke all on function app_private.enforce_staff_leave_type_rule_finality() from public,anon,authenticated;

create trigger staff_leave_type_rule_finality_trg
before update on public.staff_leave_types
for each row execute function app_private.enforce_staff_leave_type_rule_finality();

create or replace function app_private.enforce_staff_leave_request_decision_finality()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if old.decided_at is not null and (
    new.decided_at is distinct from old.decided_at
    or new.decided_by_user_id is distinct from old.decided_by_user_id
    or new.approved_units is distinct from old.approved_units
    or new.decision_note is distinct from old.decision_note
  ) then
    raise exception 'Staff leave decision history is final';
  end if;
  if old.status in ('approved','rejected','cancelled')
     and new.status not in (old.status,'cancelled') then
    raise exception 'Final staff leave state cannot be reopened';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_staff_leave_request_decision_finality() from public,anon,authenticated;

create trigger staff_leave_request_decision_finality_trg
before update on public.staff_leave_requests
for each row execute function app_private.enforce_staff_leave_request_decision_finality();

create or replace function public.configure_staff_leave_type(
  p_school_id uuid,
  p_code text,
  p_display_name text,
  p_tracks_balance boolean default false,
  p_evidence_requirement text default 'optional',
  p_source_reference text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_id uuid;
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_name text:=btrim(coalesce(p_display_name,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_staff_leave(p_school_id) then raise exception 'Permission denied'; end if;
  if v_code='' or char_length(v_code)>40 then raise exception 'Leave type code is required and must be 40 characters or fewer'; end if;
  if v_name='' or char_length(v_name)>120 then raise exception 'Leave type name is required and must be 120 characters or fewer'; end if;
  if p_evidence_requirement not in ('none','optional','required') then raise exception 'Evidence requirement is invalid'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  insert into public.staff_leave_types(
    tenant_id,school_id,code,display_name,tracks_balance,evidence_requirement,
    source_reference,status,created_by_user_id
  ) values(
    v_school.tenant_id,v_school.id,v_code,v_name,coalesce(p_tracks_balance,false),
    p_evidence_requirement,nullif(btrim(coalesce(p_source_reference,'')),''),
    case when p_active then 'active' else 'inactive' end,auth.uid()
  )
  on conflict(school_id,code) do update set
    display_name=excluded.display_name,
    tracks_balance=excluded.tracks_balance,
    evidence_requirement=excluded.evidence_requirement,
    source_reference=excluded.source_reference,
    status=excluded.status,
    updated_at=now()
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_school.tenant_id,v_school.id,auth.uid(),'staff.leave_type.configured',
    'staff_leave_type',v_id,
    jsonb_build_object(
      'code',v_code,
      'tracks_balance',coalesce(p_tracks_balance,false),
      'evidence_requirement',p_evidence_requirement,
      'source_reference',nullif(btrim(coalesce(p_source_reference,'')),''),
      'active',p_active
    )
  );
  return v_id;
end;
$$;

create or replace function public.submit_staff_leave_request(
  p_school_id uuid,
  p_leave_type_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_requested_units numeric,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_staff_id uuid;
  v_type public.staff_leave_types%rowtype;
  v_school public.schools%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on then
    raise exception 'Leave date range is invalid';
  end if;
  if p_requested_units is null or p_requested_units<=0 or p_requested_units>366 then
    raise exception 'Requested leave units must be between 0 and 366';
  end if;

  v_staff_id:=app_private.staff_leave_actor_staff_member(p_school_id);
  if v_staff_id is null then raise exception 'A current staff-linked school membership is required'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id=v_staff_id
      and ssa.effective_from<=p_starts_on
      and (ssa.effective_to is null or ssa.effective_to>=p_starts_on)
  ) then
    raise exception 'Staff member does not have an effective school placement for the leave start date';
  end if;

  select * into v_type
  from public.staff_leave_types
  where id=p_leave_type_id and school_id=p_school_id and status='active';
  if not found then raise exception 'Active leave type not found'; end if;

  if exists(
    select 1 from public.staff_leave_requests r
    where r.school_id=p_school_id
      and r.staff_member_id=v_staff_id
      and r.status in ('submitted','approved')
      and r.starts_on<=p_ends_on
      and r.ends_on>=p_starts_on
  ) then
    raise exception 'Staff member already has an overlapping submitted or approved leave request';
  end if;

  insert into public.staff_leave_requests(
    tenant_id,school_id,staff_member_id,leave_type_id,starts_on,ends_on,
    requested_units,reason,status,submitted_by_user_id
  ) values(
    v_school.tenant_id,v_school.id,v_staff_id,v_type.id,p_starts_on,p_ends_on,
    p_requested_units,nullif(btrim(coalesce(p_reason,'')),''),'submitted',auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_school.tenant_id,v_school.id,auth.uid(),'staff.leave_request.submitted',
    'staff_leave_request',v_id,
    jsonb_build_object(
      'staff_member_id',v_staff_id,
      'leave_type_id',v_type.id,
      'starts_on',p_starts_on,
      'ends_on',p_ends_on,
      'requested_units',p_requested_units
    )
  );
  return v_id;
end;
$$;

create or replace function public.decide_staff_leave_request(
  p_request_id uuid,
  p_decision text,
  p_approved_units numeric default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_request public.staff_leave_requests%rowtype;
  v_type public.staff_leave_types%rowtype;
  v_decision text:=lower(btrim(coalesce(p_decision,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_request
  from public.staff_leave_requests
  where id=p_request_id
  for update;
  if not found then raise exception 'Leave request not found'; end if;
  if not app_private.can_manage_staff_leave(v_request.school_id) then raise exception 'Permission denied'; end if;
  if v_request.status<>'submitted' then raise exception 'Only submitted leave requests can be decided'; end if;
  if v_request.submitted_by_user_id=auth.uid() then raise exception 'Staff cannot approve or reject their own leave request'; end if;
  if v_decision not in ('approve','reject') then raise exception 'Leave decision must be approve or reject'; end if;

  select * into v_type from public.staff_leave_types where id=v_request.leave_type_id;
  if not found then raise exception 'Leave type not found'; end if;

  if v_decision='approve' then
    if p_approved_units is null or p_approved_units<=0 or p_approved_units>366 then
      raise exception 'Approved leave units must be between 0 and 366';
    end if;
    if v_type.evidence_requirement='required'
       and not exists(
         select 1 from public.staff_leave_request_attachments a
         where a.leave_request_id=v_request.id
       ) then
      raise exception 'Required leave evidence has not been attached';
    end if;

    update public.staff_leave_requests
    set status='approved',
        approved_units=p_approved_units,
        decided_by_user_id=auth.uid(),
        decided_at=now(),
        decision_note=nullif(btrim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=v_request.id;

    if v_type.tracks_balance then
      insert into public.staff_leave_ledger_entries(
        tenant_id,school_id,staff_member_id,leave_type_id,leave_request_id,
        entry_kind,units_delta,effective_on,note,created_by_user_id
      ) values(
        v_request.tenant_id,v_request.school_id,v_request.staff_member_id,v_request.leave_type_id,
        v_request.id,'debit',-p_approved_units,v_request.starts_on,
        'Approved leave debit',auth.uid()
      );
    end if;

    insert into public.staff_absences(
      tenant_id,school_id,staff_member_id,leave_request_id,absence_kind,
      starts_on,ends_on,status,operational_note,created_by_user_id
    ) values(
      v_request.tenant_id,v_request.school_id,v_request.staff_member_id,v_request.id,
      'approved_leave',v_request.starts_on,v_request.ends_on,'active',
      nullif(btrim(coalesce(p_note,'')),''),auth.uid()
    );
  else
    update public.staff_leave_requests
    set status='rejected',
        decided_by_user_id=auth.uid(),
        decided_at=now(),
        decision_note=nullif(btrim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=v_request.id;
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_request.tenant_id,v_request.school_id,auth.uid(),
    case when v_decision='approve' then 'staff.leave_request.approved' else 'staff.leave_request.rejected' end,
    'staff_leave_request',v_request.id,
    jsonb_build_object(
      'staff_member_id',v_request.staff_member_id,
      'decision',v_decision,
      'approved_units',case when v_decision='approve' then p_approved_units else null end
    )
  );
end;
$$;

create or replace function public.cancel_staff_leave_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_request public.staff_leave_requests%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_can_manage boolean;
  v_actor_staff uuid;
  v_debit numeric(8,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_reason is null then raise exception 'Cancellation reason is required'; end if;

  select * into v_request
  from public.staff_leave_requests
  where id=p_request_id
  for update;
  if not found then raise exception 'Leave request not found'; end if;

  v_can_manage:=app_private.can_manage_staff_leave(v_request.school_id);
  v_actor_staff:=app_private.staff_leave_actor_staff_member(v_request.school_id);
  if not v_can_manage and v_actor_staff is distinct from v_request.staff_member_id then
    raise exception 'Permission denied';
  end if;
  if v_request.status not in ('submitted','approved') then
    raise exception 'Only submitted or approved leave requests can be cancelled';
  end if;
  if v_request.status='approved' and not v_can_manage then
    raise exception 'Approved leave cancellation requires school leave manager approval';
  end if;

  update public.staff_leave_requests
  set status='cancelled',
      cancelled_by_user_id=auth.uid(),
      cancelled_at=now(),
      cancellation_reason=v_reason,
      updated_at=now()
  where id=v_request.id;

  if v_request.status='approved' then
    select -le.units_delta into v_debit
    from public.staff_leave_ledger_entries le
    where le.leave_request_id=v_request.id and le.entry_kind='debit';

    if v_debit is not null then
      insert into public.staff_leave_ledger_entries(
        tenant_id,school_id,staff_member_id,leave_type_id,leave_request_id,
        entry_kind,units_delta,effective_on,note,created_by_user_id
      ) values(
        v_request.tenant_id,v_request.school_id,v_request.staff_member_id,v_request.leave_type_id,
        v_request.id,'reversal',v_debit,current_date,
        'Approved leave cancellation reversal',auth.uid()
      );
    end if;

    update public.staff_absences
    set status='cancelled',
        cancelled_by_user_id=auth.uid(),
        cancelled_at=now(),
        updated_at=now()
    where leave_request_id=v_request.id and status='active';
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_request.tenant_id,v_request.school_id,auth.uid(),'staff.leave_request.cancelled',
    'staff_leave_request',v_request.id,
    jsonb_build_object('prior_status',v_request.status,'reason',v_reason)
  );
end;
$$;

create or replace function public.post_staff_leave_ledger_entry(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_leave_type_id uuid,
  p_entry_kind text,
  p_units_delta numeric,
  p_effective_on date,
  p_note text,
  p_source_reference text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_kind text:=lower(btrim(coalesce(p_entry_kind,'')));
  v_source text:=nullif(btrim(coalesce(p_source_reference,'')),'');
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_staff_leave(p_school_id) then raise exception 'Permission denied'; end if;
  if v_kind not in ('opening','accrual','adjustment') then raise exception 'Manual leave ledger entry kind is invalid'; end if;
  if p_units_delta is null or p_units_delta=0 or abs(p_units_delta)>1000 then raise exception 'Leave ledger units must be non-zero and within 1000 units'; end if;
  if p_effective_on is null then raise exception 'Leave ledger effective date is required'; end if;
  if v_source is null then raise exception 'A source reference is required for manual leave ledger entries'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id and ssa.staff_member_id=p_staff_member_id
  ) then raise exception 'Staff member is not placed at this school'; end if;
  if not exists(
    select 1 from public.staff_leave_types lt
    where lt.id=p_leave_type_id and lt.school_id=p_school_id and lt.tracks_balance
  ) then raise exception 'Tracked leave type not found'; end if;

  insert into public.staff_leave_ledger_entries(
    tenant_id,school_id,staff_member_id,leave_type_id,entry_kind,units_delta,
    effective_on,note,source_reference,created_by_user_id
  ) values(
    v_school.tenant_id,v_school.id,p_staff_member_id,p_leave_type_id,v_kind,p_units_delta,
    p_effective_on,nullif(btrim(coalesce(p_note,'')),''),v_source,auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_school.tenant_id,v_school.id,auth.uid(),'staff.leave_ledger.entry_posted',
    'staff_leave_ledger_entry',v_id,
    jsonb_build_object(
      'staff_member_id',p_staff_member_id,
      'leave_type_id',p_leave_type_id,
      'entry_kind',v_kind,
      'units_delta',p_units_delta,
      'effective_on',p_effective_on,
      'source_reference',v_source
    )
  );
  return v_id;
end;
$$;

create or replace function public.list_staff_leave_workspace(
  p_school_id uuid,
  p_as_of date default current_date
)
returns table(
  request_id uuid,
  staff_member_id uuid,
  staff_name text,
  leave_type_id uuid,
  leave_type_name text,
  tracks_balance boolean,
  starts_on date,
  ends_on date,
  requested_units numeric,
  approved_units numeric,
  status text,
  reason text,
  decision_note text,
  submitted_at timestamptz,
  decided_at timestamptz,
  cancelled_at timestamptz,
  balance_units numeric,
  absence_status text,
  timetable_slots_affected integer,
  evidence_count integer
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_actor_staff uuid;
  v_manager boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_school_id is null or p_as_of is null then raise exception 'School and as-of date are required'; end if;
  if not app_private.has_school_access(p_school_id)
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;

  v_actor_staff:=app_private.staff_leave_actor_staff_member(p_school_id);
  v_manager:=app_private.can_manage_staff_leave(p_school_id);
  if not v_manager and v_actor_staff is null then raise exception 'Permission denied'; end if;

  return query
  select
    r.id,
    r.staff_member_id,
    concat_ws(' ',s.first_name,s.last_name),
    r.leave_type_id,
    lt.display_name,
    lt.tracks_balance,
    r.starts_on,
    r.ends_on,
    r.requested_units,
    r.approved_units,
    r.status,
    r.reason,
    r.decision_note,
    r.submitted_at,
    r.decided_at,
    r.cancelled_at,
    coalesce((
      select sum(le.units_delta)
      from public.staff_leave_ledger_entries le
      where le.school_id=r.school_id
        and le.staff_member_id=r.staff_member_id
        and le.leave_type_id=r.leave_type_id
        and le.effective_on<=p_as_of
    ),0)::numeric,
    a.status,
    coalesce((
      select count(distinct ts.id)::integer
      from public.teacher_allocations ta
      join public.timetable_slots ts
        on ts.teacher_allocation_id=ta.id
       and ts.school_id=ta.school_id
       and ts.status='active'
      where ta.school_id=r.school_id
        and ta.staff_member_id=r.staff_member_id
        and ta.active_from<=r.ends_on
        and (ta.active_to is null or ta.active_to>=r.starts_on)
        and ts.academic_year between extract(year from r.starts_on)::integer
                                 and extract(year from r.ends_on)::integer
    ),0),
    coalesce((
      select count(*)::integer
      from public.staff_leave_request_attachments att
      where att.leave_request_id=r.id
    ),0)
  from public.staff_leave_requests r
  join public.staff_members s on s.id=r.staff_member_id
  join public.staff_leave_types lt on lt.id=r.leave_type_id
  left join public.staff_absences a on a.leave_request_id=r.id
  where r.school_id=p_school_id
    and (v_manager or r.staff_member_id=v_actor_staff)
  order by
    case r.status when 'submitted' then 0 when 'approved' then 1 else 2 end,
    r.starts_on desc,
    r.submitted_at desc;
end;
$$;

insert into storage.buckets(id,name,public)
values('staff-leave-evidence','staff-leave-evidence',false)
on conflict(id) do update set public=false;

create or replace function app_private.can_access_staff_leave_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,storage,app_private
as $$
  select case
    when array_length(storage.foldername(p_name),1)<3 then false
    else exists(
      select 1
      from public.staff_leave_requests r
      where r.id::text=(storage.foldername(p_name))[3]
        and r.school_id::text=(storage.foldername(p_name))[1]
        and (
          r.submitted_by_user_id=auth.uid()
          or app_private.can_manage_staff_leave(r.school_id)
        )
    )
  end;
$$;
revoke all on function app_private.can_access_staff_leave_object(text) from public,anon,authenticated;

create policy "staff uploads own leave evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id='staff-leave-evidence'
  and array_length(storage.foldername(name),1)>=3
  and (storage.foldername(name))[2]=auth.uid()::text
  and app_private.can_access_staff_leave_object(name)
  and exists(
    select 1 from public.staff_leave_requests r
    where r.id::text=(storage.foldername(name))[3]
      and r.school_id::text=(storage.foldername(name))[1]
      and r.submitted_by_user_id=auth.uid()
      and r.status='submitted'
  )
);

create policy "authorized users read staff leave evidence"
on storage.objects for select to authenticated
using (
  bucket_id='staff-leave-evidence'
  and app_private.can_access_staff_leave_object(name)
);

create policy "staff deletes editable leave evidence"
on storage.objects for delete to authenticated
using (
  bucket_id='staff-leave-evidence'
  and array_length(storage.foldername(name),1)>=3
  and (storage.foldername(name))[2]=auth.uid()::text
  and exists(
    select 1 from public.staff_leave_requests r
    where r.id::text=(storage.foldername(name))[3]
      and r.school_id::text=(storage.foldername(name))[1]
      and r.submitted_by_user_id=auth.uid()
      and r.status='submitted'
  )
);

create or replace function public.register_staff_leave_attachment(
  p_request_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,storage
as $$
declare
  v_request public.staff_leave_requests%rowtype;
  v_id uuid;
  v_prefix text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_request from public.staff_leave_requests where id=p_request_id;
  if not found or v_request.submitted_by_user_id<>auth.uid() then raise exception 'Leave request not found'; end if;
  if v_request.status<>'submitted' then raise exception 'Leave evidence can only be changed while the request is submitted'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Unsupported attachment type'; end if;
  if p_file_size_bytes is null or p_file_size_bytes<=0 or p_file_size_bytes>10485760 then raise exception 'Attachment must be 10 MB or smaller'; end if;
  if btrim(coalesce(p_storage_path,''))='' or btrim(coalesce(p_file_name,''))='' then raise exception 'Attachment metadata is incomplete'; end if;

  v_prefix:=v_request.school_id::text||'/'||auth.uid()::text||'/'||v_request.id::text||'/';
  if left(btrim(p_storage_path),length(v_prefix))<>v_prefix then
    raise exception 'Attachment storage path does not match this leave request';
  end if;
  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='staff-leave-evidence' and o.name=btrim(p_storage_path)
  ) then raise exception 'Uploaded leave evidence object was not found'; end if;

  insert into public.staff_leave_request_attachments(
    tenant_id,school_id,leave_request_id,storage_path,file_name,mime_type,
    file_size_bytes,uploaded_by_user_id
  ) values(
    v_request.tenant_id,v_request.school_id,v_request.id,btrim(p_storage_path),
    btrim(p_file_name),p_mime_type,p_file_size_bytes,auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.configure_staff_leave_type(uuid,text,text,boolean,text,text,boolean) from public,anon;
revoke all on function public.submit_staff_leave_request(uuid,uuid,date,date,numeric,text) from public,anon;
revoke all on function public.decide_staff_leave_request(uuid,text,numeric,text) from public,anon;
revoke all on function public.cancel_staff_leave_request(uuid,text) from public,anon;
revoke all on function public.post_staff_leave_ledger_entry(uuid,uuid,uuid,text,numeric,date,text,text) from public,anon;
revoke all on function public.list_staff_leave_workspace(uuid,date) from public,anon;
revoke all on function public.register_staff_leave_attachment(uuid,text,text,text,bigint) from public,anon;

grant execute on function public.configure_staff_leave_type(uuid,text,text,boolean,text,text,boolean) to authenticated;
grant execute on function public.submit_staff_leave_request(uuid,uuid,date,date,numeric,text) to authenticated;
grant execute on function public.decide_staff_leave_request(uuid,text,numeric,text) to authenticated;
grant execute on function public.cancel_staff_leave_request(uuid,text) to authenticated;
grant execute on function public.post_staff_leave_ledger_entry(uuid,uuid,uuid,text,numeric,date,text,text) to authenticated;
grant execute on function public.list_staff_leave_workspace(uuid,date) to authenticated;
grant execute on function public.register_staff_leave_attachment(uuid,text,text,text,bigint) to authenticated;

comment on table public.staff_leave_types is
'School-governed leave categories. No Ministry entitlement values are seeded without verified source documentation.';
comment on table public.staff_leave_ledger_entries is
'Immutable signed-unit ledger. Current staff leave balance is derived by summing entries; no mutable balance field exists.';
comment on table public.staff_absences is
'Operational staff absence state. Approved leave creates a linked absence without rewriting calendar or timetable truth.';
comment on function public.list_staff_leave_workspace(uuid,date) is
'Read model for own leave or authorised school-wide leave management, including ledger-derived balance and timetable impact awareness.';
