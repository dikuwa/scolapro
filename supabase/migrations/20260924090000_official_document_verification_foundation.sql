-- Issue #707: shared provenance and public verification foundation for
-- finalized official documents. Raw tokens and private source links remain
-- inaccessible to application roles; the public resolver returns a fixed,
-- minimal projection only.

create table public.official_document_type_registry (
  type_key text primary key check (type_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  public_label text not null check (nullif(btrim(public_label), '') is not null),
  reference_code text not null unique check (reference_code ~ '^[A-Z0-9]{2,8}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.official_document_type_registry(type_key, public_label, reference_code)
values
  ('official_attendance_summary', 'Official Attendance Summary', 'ATT'),
  ('room_inventory_a4_sheet', 'Room Inventory A4 Sheet', 'ROOM');

create table public.official_document_reference_counters (
  type_key text not null references public.official_document_type_registry(type_key) on delete restrict,
  issue_year integer not null check (issue_year between 2000 and 2200),
  next_number bigint not null default 1 check (next_number > 0),
  primary key (type_key, issue_year)
);

create table public.official_document_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  document_type_key text not null references public.official_document_type_registry(type_key) on delete restrict,
  document_type_label text not null check (nullif(btrim(document_type_label), '') is not null),
  source_record_id uuid not null,
  source_lineage_id uuid not null,
  revision integer not null check (revision > 0),
  supersedes_verification_id uuid references public.official_document_verifications(id) on delete restrict,
  scolapro_reference text not null unique check (scolapro_reference ~ '^SP-[A-Z0-9]{2,8}-[0-9]{4}-[0-9]{6}$'),
  verification_token text not null unique check (verification_token ~ '^[A-Za-z0-9_-]{32}$'),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  school_name_snapshot text not null check (nullif(btrim(school_name_snapshot), '') is not null),
  issued_on date not null,
  finalized_at timestamptz not null,
  status text not null default 'valid' check (status in ('valid', 'superseded', 'revoked')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  revocation_reason text,
  unique (tenant_id, document_type_key, source_record_id),
  unique (tenant_id, document_type_key, source_lineage_id, revision),
  check (
    (revision = 1 and supersedes_verification_id is null)
    or (revision > 1 and supersedes_verification_id is not null)
  ),
  check (
    (status <> 'revoked' and revoked_at is null and revoked_by_user_id is null and revocation_reason is null)
    or (status = 'revoked' and revoked_at is not null and nullif(btrim(revocation_reason), '') is not null)
  )
);

create index official_document_verifications_token_hash_idx
  on public.official_document_verifications(token_hash);
create index official_document_verifications_lineage_idx
  on public.official_document_verifications(tenant_id, document_type_key, source_lineage_id, revision desc);

alter table public.official_document_type_registry enable row level security;
alter table public.official_document_reference_counters enable row level security;
alter table public.official_document_verifications enable row level security;

create policy "official document type registry is internal only"
on public.official_document_type_registry for all
to anon, authenticated
using (false)
with check (false);

create policy "official document reference counters are internal only"
on public.official_document_reference_counters for all
to anon, authenticated
using (false)
with check (false);

create policy "official document verification provenance is internal only"
on public.official_document_verifications for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.official_document_type_registry from public, anon, authenticated;
revoke all on public.official_document_reference_counters from public, anon, authenticated;
revoke all on public.official_document_verifications from public, anon, authenticated;

create or replace function app_private.enforce_official_document_verification_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_parent public.official_document_verifications%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Official document verification history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.document_type_key is distinct from old.document_type_key
       or new.document_type_label is distinct from old.document_type_label
       or new.source_record_id is distinct from old.source_record_id
       or new.source_lineage_id is distinct from old.source_lineage_id
       or new.revision is distinct from old.revision
       or new.supersedes_verification_id is distinct from old.supersedes_verification_id
       or new.scolapro_reference is distinct from old.scolapro_reference
       or new.verification_token is distinct from old.verification_token
       or new.token_hash is distinct from old.token_hash
       or new.school_name_snapshot is distinct from old.school_name_snapshot
       or new.issued_on is distinct from old.issued_on
       or new.finalized_at is distinct from old.finalized_at
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Official document verification provenance is immutable';
    end if;

    if not (
      (old.status = 'valid' and new.status in ('superseded', 'revoked'))
      or (old.status = 'superseded' and new.status = 'revoked')
    ) then
      raise exception 'Invalid official document verification status transition';
    end if;
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Official document tenant and school scope do not match';
  end if;

  if tg_op = 'INSERT' and new.supersedes_verification_id is not null then
    select * into v_parent
    from public.official_document_verifications odv
    where odv.id = new.supersedes_verification_id;

    if v_parent.id is null
       or v_parent.status <> 'valid'
       or v_parent.tenant_id <> new.tenant_id
       or v_parent.school_id <> new.school_id
       or v_parent.document_type_key <> new.document_type_key
       or v_parent.source_lineage_id <> new.source_lineage_id
       or new.revision <> v_parent.revision + 1 then
      raise exception 'Official document revision provenance is invalid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_official_document_verification_integrity()
  from public, anon, authenticated;

create trigger official_document_verification_integrity
before insert or update or delete on public.official_document_verifications
for each row execute function app_private.enforce_official_document_verification_integrity();

create or replace function app_private.register_official_document_verification(
  p_tenant_id uuid,
  p_school_id uuid,
  p_document_type_key text,
  p_source_record_id uuid,
  p_source_lineage_id uuid,
  p_revision integer,
  p_supersedes_verification_id uuid,
  p_issued_on date,
  p_finalized_at timestamptz,
  p_actor_user_id uuid default null
) returns table (
  verification_id uuid,
  scolapro_reference text,
  verification_token text,
  verification_path text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school public.schools%rowtype;
  v_type public.official_document_type_registry%rowtype;
  v_existing public.official_document_verifications%rowtype;
  v_token text;
  v_number bigint;
  v_reference text;
  v_created public.official_document_verifications%rowtype;
begin
  if p_finalized_at is null then
    raise exception 'Draft or non-finalized documents cannot be registered for public verification';
  end if;
  if p_issued_on is null or p_source_record_id is null or p_source_lineage_id is null then
    raise exception 'Finalized document provenance is incomplete';
  end if;
  if p_revision is null or p_revision < 1 then
    raise exception 'Official document revision must be positive';
  end if;

  select * into v_school from public.schools s where s.id = p_school_id;
  if v_school.id is null or v_school.tenant_id <> p_tenant_id then
    raise exception 'Official document tenant and school scope do not match';
  end if;

  select * into v_type
  from public.official_document_type_registry r
  where r.type_key = p_document_type_key and r.active;
  if v_type.type_key is null then
    raise exception 'Official document type is not registered or active';
  end if;

  select * into v_existing
  from public.official_document_verifications odv
  where odv.tenant_id = p_tenant_id
    and odv.document_type_key = p_document_type_key
    and odv.source_record_id = p_source_record_id;

  if v_existing.id is not null then
    if v_existing.school_id <> p_school_id
       or v_existing.source_lineage_id <> p_source_lineage_id
       or v_existing.revision <> p_revision
       or v_existing.issued_on <> p_issued_on
       or v_existing.finalized_at <> p_finalized_at then
      raise exception 'Source record already has different verification provenance';
    end if;
    return query select v_existing.id, v_existing.scolapro_reference,
      v_existing.verification_token, '/verify/' || v_existing.verification_token;
    return;
  end if;

  if (p_revision = 1 and p_supersedes_verification_id is not null)
     or (p_revision > 1 and p_supersedes_verification_id is null) then
    raise exception 'Official document revision predecessor is invalid';
  end if;

  insert into public.official_document_reference_counters(type_key, issue_year, next_number)
  values (p_document_type_key, extract(year from p_issued_on)::integer, 2)
  on conflict(type_key, issue_year) do update
    set next_number = public.official_document_reference_counters.next_number + 1
  returning next_number - 1 into v_number;

  v_reference := 'SP-' || v_type.reference_code || '-'
    || extract(year from p_issued_on)::integer || '-' || lpad(v_number::text, 6, '0');
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');

  insert into public.official_document_verifications(
    tenant_id, school_id, document_type_key, document_type_label,
    source_record_id, source_lineage_id, revision, supersedes_verification_id,
    scolapro_reference, verification_token, token_hash, school_name_snapshot,
    issued_on, finalized_at, created_by_user_id
  ) values (
    p_tenant_id, p_school_id, p_document_type_key, v_type.public_label,
    p_source_record_id, p_source_lineage_id, p_revision, p_supersedes_verification_id,
    v_reference, v_token, extensions.digest(v_token, 'sha256'), v_school.name,
    p_issued_on, p_finalized_at, p_actor_user_id
  ) returning * into v_created;

  if p_supersedes_verification_id is not null then
    update public.official_document_verifications
    set status = 'superseded'
    where id = p_supersedes_verification_id and status = 'valid';
  end if;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    p_tenant_id, p_school_id, p_actor_user_id,
    'official_document_verification.registered', 'official_document_verification', v_created.id,
    jsonb_build_object(
      'document_type', p_document_type_key,
      'scolapro_reference', v_reference,
      'revision', p_revision
    )
  );

  return query select v_created.id, v_created.scolapro_reference,
    v_created.verification_token, '/verify/' || v_created.verification_token;
end;
$$;

revoke all on function app_private.register_official_document_verification(
  uuid, uuid, text, uuid, uuid, integer, uuid, date, timestamptz, uuid
) from public, anon, authenticated;

create or replace function app_private.revoke_official_document_verification(
  p_verification_id uuid,
  p_reason text,
  p_actor_user_id uuid default null
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_record public.official_document_verifications%rowtype;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A revocation reason is required';
  end if;

  select * into v_record
  from public.official_document_verifications odv
  where odv.id = p_verification_id
  for update;

  if v_record.id is null then
    raise exception 'Official document verification not found';
  end if;
  if v_record.status = 'revoked' then
    raise exception 'Official document verification is already revoked';
  end if;

  update public.official_document_verifications
  set status = 'revoked', revoked_at = now(), revoked_by_user_id = p_actor_user_id,
      revocation_reason = btrim(p_reason)
  where id = p_verification_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_record.tenant_id, v_record.school_id, p_actor_user_id,
    'official_document_verification.revoked', 'official_document_verification', v_record.id,
    jsonb_build_object('scolapro_reference', v_record.scolapro_reference)
  );
end;
$$;

revoke all on function app_private.revoke_official_document_verification(uuid, text, uuid)
  from public, anon, authenticated;

create or replace function public.resolve_official_document_verification(p_token text)
returns table (
  school_name text,
  document_type text,
  scolapro_reference text,
  issued_on date,
  validity_status text,
  revision integer,
  confirmation text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    odv.school_name_snapshot,
    odv.document_type_label,
    odv.scolapro_reference,
    odv.issued_on,
    odv.status,
    odv.revision,
    'This reference matches a finalized ScolaPro record.'::text
  from public.official_document_verifications odv
  where p_token ~ '^[A-Za-z0-9_-]{32}$'
    and odv.token_hash = extensions.digest(p_token, 'sha256')
  limit 1;
$$;

revoke all on function public.resolve_official_document_verification(text) from public;
grant execute on function public.resolve_official_document_verification(text) to anon, authenticated;

comment on table public.official_document_verifications is
  'Private, immutable provenance for finalized official-document versions. Public access is only through the minimal token resolver.';
comment on function app_private.register_official_document_verification(
  uuid, uuid, text, uuid, uuid, integer, uuid, date, timestamptz, uuid
) is 'Trusted finalization hook. Future official-document finalizers call this after creating an immutable finalized version.';
comment on function public.resolve_official_document_verification(text) is
  'Public token-only lookup returning minimal provenance; never returns tenant, school, source-record, storage, or document-content identifiers.';
