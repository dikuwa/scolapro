-- Credential issuance reservation ledger (foundation only).
-- No plaintext credential or recovery secret may be stored here.
create table if not exists public.staff_credential_issuance_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  finalized_at timestamptz,
  outcome text not null default 'reserved'
    check (outcome in ('reserved','completed','failed','cancelled')),
  -- Metadata identifies an issued credential without retaining the secret.
  credential_fingerprint text check (
    credential_fingerprint is null or credential_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  credential_expires_at timestamptz,
  constraint staff_credential_issuance_terminal_metadata_check check (
    (outcome = 'reserved' and credential_fingerprint is null and credential_expires_at is null and finalized_at is null)
    or
    (outcome = 'completed' and credential_fingerprint is not null and credential_expires_at is not null and finalized_at is not null)
    or
    (outcome in ('failed','cancelled') and credential_fingerprint is null and credential_expires_at is null and finalized_at is not null)
  )
);
create index if not exists staff_credential_attempts_scope_time_idx
  on public.staff_credential_issuance_attempts(school_id,staff_member_id,attempted_at desc);
create index if not exists staff_credential_attempts_actor_time_idx
  on public.staff_credential_issuance_attempts(actor_user_id,attempted_at desc);
create index if not exists staff_credential_attempts_target_time_idx
  on public.staff_credential_issuance_attempts(target_user_id,attempted_at desc);

alter table public.staff_credential_issuance_attempts enable row level security;
-- Keep the public-schema security baseline (every table owns a policy) without
-- exposing any client policy. Service role is the only policy role and also
-- remains the trusted boundary for the governed reservation/finalization RPCs.
create policy staff_credential_issuance_service_only
  on public.staff_credential_issuance_attempts
  for all to service_role using (true) with check (true);
revoke all on table public.staff_credential_issuance_attempts from public, anon, authenticated;
