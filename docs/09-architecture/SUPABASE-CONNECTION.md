# ScolaPro Supabase Connection

Status: CONNECTED

## Project

- Supabase project name: `scolapro`
- Project ref: `jhgumnvhoxmapmgotchu`
- Region: `eu-west-1`
- Project URL: `https://jhgumnvhoxmapmgotchu.supabase.co`

## Repository alignment

The remote project has been brought to the same migration baseline as the repository:

- `20260827190000_initial_core.sql`
- `20260827191500_core_write_policies.sql`
- `20260827193000_platform_role_scope.sql`
- `20260827194500_create_learner_enrolment_rpc.sql`
- `20260827200000_learner_integrity.sql`
- `20260827201500_harden_learner_rpc.sql`

Migration history on Supabase must continue to match the timestamped files in `supabase/migrations/`.

## Local application configuration

Do not commit `.env.local`.

The default local workflow is:

```bash
supabase start
supabase db reset
SCOLAPRO_LOCAL_ADMIN_PASSWORD='<choose-a-local-password>' pnpm local:seed-auth
pnpm dev
```

`pnpm dev` obtains the local URL, publishable key and server-only service-role
key from `supabase status` and refuses a non-loopback URL. This prevents stale
hosted values in `.env.local` from coupling localhost to a hosted schema.

Use `pnpm dev:configured` only for an intentionally configured non-local
environment. The publishable key is intentionally not stored in repository
files; obtain it from the environment owner or local secret manager.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must not be exposed to browser code. It is not required for the first authenticated RLS-backed slice.

## Hosted CLI link

Linking and remote migration inspection are deployment operations, not part of
ordinary localhost startup. Only run them when the Control Room explicitly
assigns hosted deployment work. From the repository root, the commands are:

```bash
supabase link --project-ref jhgumnvhoxmapmgotchu
supabase migration list
```

The local and remote migration versions should match before pushing any future schema changes.

## Current baseline data

Only synthetic development data has been inserted:

- one demo tenant
- one demo school
- five grades
- two register classes
- two synthetic learners and enrolments

No real learner or staff data should be used for development fixtures.

## Security note

The learner-registration RPC is intentionally executable by authenticated users because it performs an atomic workflow, but it checks `school_admin` authorization internally before any write. Anonymous execution is explicitly revoked.

RLS remains the authoritative data-isolation boundary.
