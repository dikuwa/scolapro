# ScolaPro

ScolaPro is a Namibia-first school operations and learning platform designed around a simple principle:

> **Capture once → use everywhere.**

The repository currently contains the approved product/domain architecture plus the first production-shaped application bootstrap.

## Current technical baseline

- Next.js 16.3.3
- React 19.2
- TypeScript (strict)
- Tailwind CSS 4
- shadcn/ui using the React Aria base
- Plus Jakarta Sans UI typography
- PostgreSQL / Supabase
- Sonner
- GSAP
- TanStack Query / Table
- React Hook Form + Zod

## Mandatory architecture/design reading

Before changing the application, read `AGENTS.md`.

Frontend changes must also follow:

- `docs/08-ui-ux/DESIGN-SYSTEM.md`
- `docs/08-ui-ux/MOTION-INTERACTION.md`
- `docs/08-ui-ux/COMPONENT-INVENTORY.md`
- `docs/09-architecture/FRONTEND-ARCHITECTURE.md`

Do not replace the ScolaPro visual system with generic AI/admin-dashboard defaults.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Then open `http://localhost:3000`.

### Install the approved shadcn primitives

After dependencies are installed:

```bash
bash scripts/bootstrap-ui.sh
```

Generated shadcn components become owned ScolaPro source and must be reviewed against the canonical design system before feature work.

## Local Supabase

With the Supabase CLI installed:

```bash
supabase start
pnpm local:sync-db
```

Set a local-only Auth seed in `.env.local`:

```dotenv
SCOLAPRO_LOCAL_ADMIN_EMAIL=local-admin@scolapro.test
SCOLAPRO_LOCAL_ADMIN_PASSWORD=<choose-a-local-password>
```

Then start the app:

```bash
pnpm dev
```

`pnpm dev` deliberately reads the running loopback Supabase credentials from
`supabase status`; it does not use hosted Supabase credentials left in
`.env.local`. When the local admin password is configured, the command
idempotently creates/updates the deterministic local school-admin Auth user
before starting Next.js. Do not use `supabase db reset` after recovering real
school data into the local database.

Use `pnpm dev:configured` only when you intentionally want the Supabase
environment declared by `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Hosted and local Auth
users and sessions are separate, so hosted credentials cannot authenticate
against `pnpm dev`'s local Supabase stack.

The initial migration establishes the first vertical-slice entities:

- tenant
- school
- user/staff membership
- grades/register classes
- learner identity
- school enrolment
- audit events
- initial RLS access helpers/policies

The seed data is synthetic only.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

CI runs these checks on pushes and pull requests.

## First implementation slice

The first vertical slice proves:

`tenant → school → user/staff scope → learner → enrolment → authorized UI/data access`

See `docs/11-roadmap/FIRST-VERTICAL-SLICE.md` for the acceptance criteria.

## Status

Architecture foundation: **active / approved**  
Application bootstrap: **in progress**  
Broad feature development: **not yet opened**
