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
    (outcome = 'completed' and credential_fingerprint is not null and credential_expires_at is not null and finalized_at is not null)
    or
    (outcome <> 'completed' and credential_fingerprint is null and credential_expires_at is null)
  )
);
create index if not exists staff_credential_attempts_scope_time_idx
  on public.staff_credential_issuance_attempts(school_id,staff_member_id,attempted_at desc);
create index if not exists staff_credential_attempts_actor_time_idx
  on public.staff_credential_issuance_attempts(actor_user_id,attempted_at desc);
create index if not exists staff_credential_attempts_target_time_idx
  on public.staff_credential_issuance_attempts(target_user_id,attempted_at desc);

alter table public.staff_credential_issuance_attempts enable row level security;
-- Intentionally define no anon/authenticated RLS policy. RLS therefore fails
-- closed, while direct relation privileges are also revoked. Service-role-only
-- governed RPCs bypass RLS for reservation/finalization.
revoke all on table public.staff_credential_issuance_attempts from public, anon, authenticated;
