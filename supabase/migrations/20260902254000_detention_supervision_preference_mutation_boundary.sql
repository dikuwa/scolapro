revoke delete on table public.detention_supervision_preferences from authenticated;

comment on table public.detention_supervision_preferences is
'Per-school detention supervisor eligibility overrides. Authenticated school leaders may read/insert/update valid rows, but deletion is intentionally blocked: reverting an opt-out must be an explicit eligible=true change so actor and lifecycle audit provenance are preserved.';