-- Credential issuance reservation ledger (foundation only).
-- No issuance RPC or endpoint is enabled by this migration.
create table if not exists public.staff_credential_issuance_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  outcome text not null default 'reserved'
    check (outcome in ('reserved','completed','failed','cancelled')),
  -- Metadata must never contain a plaintext password or recovery secret.
  credential_fingerprint text check (credential_fingerprint is null or credential_fingerprint ~ '^[a-f0-9]{64}$')
);
create index if not exists staff_credential_attempts_scope_time_idx
  on public.staff_credential_issuance_attempts(school_id,staff_member_id,attempted_at desc);
create index if not exists staff_credential_attempts_actor_time_idx
  on public.staff_credential_issuance_attempts(actor_user_id,attempted_at desc);
alter table public.staff_credential_issuance_attempts enable row level security;
-- Intentionally define no anon/authenticated RLS policy. RLS therefore fails
-- closed, while direct relation privileges are also revoked. Service-role-only
-- governed RPCs bypass RLS for reservation/finalization.
revoke all on table public.staff_credential_issuance_attempts from public, anon, authenticated;
