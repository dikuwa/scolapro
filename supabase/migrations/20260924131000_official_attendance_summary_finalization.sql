-- Issue #706: governed finalization, immutable revisions and official-output
-- provenance for the Official Attendance Summary (#705 read model + #707
-- verification foundation).
--
-- Design constraints honoured here:
--   * Finalization is gated on register readiness (every expected register for
--     the reporting period confirmed). The gate is recomputed server-side so a
--     caller cannot finalize an incomplete period by forging readiness.
--   * Only Principal / Deputy Principal / School Admin may finalize. HOD has no
--     whole-school authority over an official statutory summary.
--   * The frozen summary is stored as an immutable data_snapshot jsonb. Later
--     edits to the underlying registers never mutate a finalized output.
--   * A correction is a NEW revision of the same scope (lineage), never an edit
--     to an existing finalized snapshot. The prior revision remains historically
--     valid and its public verification token resolves to 'superseded' (the
--     public resolver performs no silent redirect).
--   * Each finalized snapshot registers a minimal public verification record
--     through #707 (opaque token, no learner data, no DB UUID, no private URL).

create table public.official_attendance_summary_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  mode text not null check (mode in ('week', 'term')),
  scope_start date not null,
  scope_end date not null,
  last_teaching_date date,
  term_id uuid references public.academic_terms(id) on delete restrict,
  data_snapshot jsonb not null,
  status text not null default 'finalized' check (status in ('finalized', 'superseded', 'revoked')),
  revision integer not null check (revision > 0),
  source_lineage_id uuid not null,
  supersedes_snapshot_id uuid references public.official_attendance_summary_snapshots(id) on delete restrict,
  official_document_verification_id uuid references public.official_document_verifications(id) on delete restrict,
  finalized_by_user_id uuid references auth.users(id) on delete set null,
  finalized_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(data_snapshot) = 'object'),
  check (scope_end >= scope_start),
  unique (source_lineage_id, revision)
);

create index official_attendance_summary_snapshots_scope_idx
  on public.official_attendance_summary_snapshots(school_id, mode, scope_start, scope_end, term_id, revision desc);

comment on table public.official_attendance_summary_snapshots is
  'Immutable finalized Official Attendance Summary versions. A correction creates a new revision in the same lineage; finalized outputs are never edited.';

-- Server-authoritative readiness recomputation. Mirrors the #705 read model's
-- readiness numerator/denominator (classes x expected teaching days vs distinct
-- confirmed submissions) without touching the absence calculation formula.
create or replace function app_private.official_attendance_summary_is_ready(
  p_school_id uuid,
  p_academic_year integer,
  p_mode text,
  p_scope_start date,
  p_scope_end date,
  p_term_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_class_count integer;
  v_teaching_dates date[];
  v_expected integer;
  v_submitted integer;
begin
  if p_scope_end < p_scope_start then return false; end if;
  if p_mode not in ('week', 'term') then return false; end if;

  select coalesce(array_agg(t.target_date::date order by t.target_date), array[]::date[])
    into v_teaching_dates
  from public.resolve_school_teaching_impact_range(p_school_id, p_scope_start, p_scope_end) t
  where t.teaching_impact <> 'NO_TEACHING';

  select count(*) into v_class_count
  from public.register_classes rc
  where rc.school_id = p_school_id and rc.academic_year = p_academic_year;

  v_expected := v_class_count * coalesce(array_length(v_teaching_dates, 1), 0);

  if v_expected = 0 then return false; end if;

  select count(distinct (ars.register_class_id, ars.attendance_date))
    into v_submitted
  from public.attendance_register_submissions ars
  join public.register_classes rc on rc.id = ars.register_class_id
  where rc.school_id = p_school_id
    and rc.academic_year = p_academic_year
    and ars.attendance_date = any(v_teaching_dates);

  return v_submitted >= v_expected;
end;
$$;

revoke all on function app_private.official_attendance_summary_is_ready(uuid, integer, text, date, date, uuid)
  from public, anon, authenticated;

-- Finalize (or, when a finalized version already exists for the scope, issue a
-- new superseding revision of) the Official Attendance Summary.
create or replace function public.finalize_official_attendance_summary(
  p_school_id uuid,
  p_academic_year integer,
  p_mode text,
  p_scope_start date,
  p_scope_end date,
  p_term_id uuid,
  p_data_snapshot jsonb
) returns table (
  snapshot_id uuid,
  revision integer,
  scolapro_reference text,
  verification_token text,
  verification_path text
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_tenant uuid;
  v_existing_id uuid;
  v_existing_revision integer;
  v_existing_lineage uuid;
  v_existing_verification_id uuid;
  v_revision integer;
  v_lineage uuid;
  v_supersedes_snapshot_id uuid;
  v_supersedes_verification_id uuid;
  v_snapshot_id uuid;
  v_verification record;
  v_issued_on date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('week', 'term') then raise exception 'Invalid summary mode'; end if;
  if p_data_snapshot is null or jsonb_typeof(p_data_snapshot) <> 'object' then
    raise exception 'A finalized summary snapshot is required';
  end if;

  -- Authority: only the school's Principal / Deputy Principal / School Admin.
  if not app_private.has_school_role(p_school_id, array['principal', 'deputy_principal', 'school_admin'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Only the Principal, Deputy Principal or School Admin may finalize the official attendance summary';
  end if;

  select s.tenant_id into v_tenant from public.schools s where s.id = p_school_id;
  if v_tenant is null then raise exception 'School not found'; end if;

  -- Readiness gate: recomputed server-side; never trusts the caller.
  if not app_private.official_attendance_summary_is_ready(p_school_id, p_academic_year, p_mode, p_scope_start, p_scope_end, p_term_id) then
    raise exception 'The official attendance summary cannot be finalized until all expected registers are confirmed for the reporting period';
  end if;

  -- Locate the latest finalized version of this exact scope to chain a revision.
  select snap.id, snap.revision, snap.source_lineage_id, snap.official_document_verification_id
    into v_existing_id, v_existing_revision, v_existing_lineage, v_existing_verification_id
  from public.official_attendance_summary_snapshots snap
  where snap.school_id = p_school_id
    and snap.mode = p_mode
    and snap.scope_start = p_scope_start
    and snap.scope_end = p_scope_end
    and (snap.term_id is not distinct from p_term_id)
  order by snap.revision desc
  limit 1;

  if v_existing_id is null then
    v_revision := 1;
    v_lineage := gen_random_uuid();
    v_supersedes_snapshot_id := null;
    v_supersedes_verification_id := null;
  else
    v_revision := v_existing_revision + 1;
    v_lineage := v_existing_lineage;
    v_supersedes_snapshot_id := v_existing_id;
    v_supersedes_verification_id := v_existing_verification_id;
  end if;

  v_issued_on := p_scope_end;

  insert into public.official_attendance_summary_snapshots(
    tenant_id, school_id, academic_year, mode, scope_start, scope_end, last_teaching_date,
    term_id, data_snapshot, status, revision, source_lineage_id, supersedes_snapshot_id,
    finalized_by_user_id, finalized_at
  ) values (
    v_tenant, p_school_id, p_academic_year, p_mode, p_scope_start, p_scope_end,
    (p_data_snapshot->>'lastTeachingDate')::date,
    p_term_id, p_data_snapshot, 'finalized', v_revision, v_lineage, v_supersedes_snapshot_id,
    auth.uid(), now()
  ) returning id into v_snapshot_id;

  select * into v_verification
  from app_private.register_official_document_verification(
    v_tenant, p_school_id, 'official_attendance_summary', v_snapshot_id, v_lineage, v_revision,
    v_supersedes_verification_id, v_issued_on, now(), auth.uid()
  );

  update public.official_attendance_summary_snapshots
  set official_document_verification_id = v_verification.verification_id
  where id = v_snapshot_id;

  if v_supersedes_snapshot_id is not null then
    update public.official_attendance_summary_snapshots
    set status = 'superseded'
    where id = v_supersedes_snapshot_id and status = 'finalized';
  end if;

  insert into public.audit_events(tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_tenant, p_school_id, auth.uid(),
    'official_attendance_summary.finalized', 'official_attendance_summary_snapshot', v_snapshot_id,
    jsonb_build_object(
      'mode', p_mode, 'scope_start', p_scope_start, 'scope_end', p_scope_end,
      'revision', v_revision, 'scolapro_reference', v_verification.scolapro_reference,
      'supersedes_revision', case when v_revision > 1 then v_existing_revision else null end
    )
  );

  return query select v_snapshot_id, v_revision, v_verification.scolapro_reference,
    v_verification.verification_token, v_verification.verification_path;
end;
$$;

revoke all on function public.finalize_official_attendance_summary(uuid, integer, text, date, date, uuid, jsonb)
  from public, anon;
grant execute on function public.finalize_official_attendance_summary(uuid, integer, text, date, date, uuid, jsonb)
  to authenticated;

-- Read-only resolution of the current finalized version for a scope. Returns the
-- frozen snapshot plus minimal verification metadata. Runs as definer so it can
-- read the #707 provenance table (RLS-hidden from application roles) without
-- leaking anything beyond the same authorized-school audience.
create or replace function public.get_official_attendance_summary_finalization(
  p_school_id uuid,
  p_mode text,
  p_scope_start date,
  p_scope_end date,
  p_term_id uuid
) returns table (
  snapshot_id uuid,
  revision integer,
  status text,
  scolapro_reference text,
  verification_token text,
  verification_path text,
  finalized_at timestamptz,
  supersedes_snapshot_id uuid,
  data_snapshot jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id, array['school_admin', 'principal', 'deputy_principal', 'hod', 'teacher', 'class_teacher'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;

  return query
  select s.id, s.revision, s.status, v.scolapro_reference, v.verification_token,
         '/verify/' || v.verification_token, s.finalized_at, s.supersedes_snapshot_id, s.data_snapshot
  from public.official_attendance_summary_snapshots s
  join public.official_document_verifications v on v.id = s.official_document_verification_id
  where s.school_id = p_school_id
    and s.mode = p_mode
    and s.scope_start = p_scope_start
    and s.scope_end = p_scope_end
    and (s.term_id is not distinct from p_term_id)
  order by s.revision desc
  limit 1;
end;
$$;

revoke all on function public.get_official_attendance_summary_finalization(uuid, text, date, date, uuid)
  from public, anon;
grant execute on function public.get_official_attendance_summary_finalization(uuid, text, date, date, uuid)
  to authenticated;

alter table public.official_attendance_summary_snapshots enable row level security;

-- Application roles never write; inserts happen only through the security-definer
-- finalize RPC. Read access is confined to staff with an active school role.
create policy "school staff read finalized attendance summaries"
on public.official_attendance_summary_snapshots
for select to authenticated
using (
  app_private.has_school_role(school_id, array['school_admin', 'principal', 'deputy_principal', 'hod', 'teacher', 'class_teacher'])
  or app_private.has_platform_role(array['platform_admin'])
);

revoke all on public.official_attendance_summary_snapshots from public, anon;
grant select on public.official_attendance_summary_snapshots to authenticated;
