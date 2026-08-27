# ScolaPro Technology & Tooling Baseline

> This document records the preferred platform/tooling direction before application initialization. Replaceable implementation details may evolve through ADRs; architectural responsibilities must remain clear.

## Core application

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Supabase as preferred managed PostgreSQL/Auth/Storage baseline

## Frontend interaction

- React Hook Form + Zod
- TanStack Query
- TanStack Table
- Sonner for toast notifications
- Lucide for default icons
- GSAP + `@gsap/react` for coordinated motion
- Recharts as initial standard chart library

## Data and persistence

PostgreSQL remains the system of record.

Redis is **not** a second source of truth. Use managed Redis/Upstash Redis for ephemeral infrastructure concerns such as:
- caching;
- rate limiting;
- idempotency/deduplication;
- short-lived coordination state;
- selected queue/lock use cases.

For a serverless/Vercel-oriented deployment, Upstash Redis is the preferred initial candidate because it supports HTTP/REST access patterns suitable for serverless environments.

## Background work

Preferred initial option: **Trigger.dev** for reliable long-running/background workflows requiring retries, scheduling and visible run state.

Candidate jobs:
- bulk communication;
- PDF generation;
- exports;
- curriculum import/extraction;
- Ministry/statutory snapshot generation;
- LTSM imports;
- analytics aggregate refresh;
- AI lesson-generation tasks;
- file/document processing.

Redis/BullMQ may be reconsidered if ScolaPro later operates persistent worker infrastructure where that model becomes preferable. Do not run an unmanaged BullMQ worker assumption inside ordinary serverless request handlers.

## Product analytics

Use **PostHog** behind a ScolaPro analytics abstraction for:
- product analytics;
- funnels;
- feature adoption;
- selected feature flags/experiments where appropriate;
- session replay only under strict privacy configuration.

### Education privacy guardrail

Never intentionally send sensitive learner data to product analytics.

Do not use learner names, IDs, marks, medical/support records, disciplinary details, guardian contacts or statutory-sensitive fields as analytics properties.

Session replay must use masking/suppression appropriate to school data. Sensitive pages may disable replay entirely.

## Error/performance monitoring

Use **Sentry** or an equivalent approved observability provider for:
- application errors;
- traces/performance;
- release correlation;
- selected server/background failures.

PII/sensitive learner information must be scrubbed before transmission. Logs/errors must not contain full forms or sensitive request payloads.

## Logging

Use structured server logging (Pino or equivalent) with:
- request/correlation IDs;
- tenant/school identifiers only where safe and useful;
- error classification;
- job IDs;
- no secrets;
- no sensitive learner payloads.

Axiom or Better Stack are reasonable external log/observability candidates if needed later; provider selection remains replaceable.

## Email

Use a provider adapter. Initial candidates:
- Resend;
- Postmark.

No feature module should call an email vendor directly.

## SMS / WhatsApp

Use provider adapters because Namibia-specific provider/API choices may change. Communication events belong to the ScolaPro communication service regardless of transport.

## Files

Preferred baseline:
- Supabase Storage initially, or Cloudflare R2 if cost/egress/scaling requirements favor it.

File metadata and permissions live in PostgreSQL; object storage alone is not the authorization model.

## AI

AI provider access must be abstracted. Do not hard-code one model/vendor into curriculum or teacher workflows.

AI outputs are drafts/assistance until user or governed workflow accepts them. Academic/statutory truth must never depend solely on opaque AI output.

## CI/CD

Preferred:
- GitHub Actions for lint/typecheck/test/security checks;
- Vercel preview deployments for web application review;
- protected production deployment process;
- database migrations applied through controlled migration workflow, not ad-hoc runtime schema mutation.

## Package manager

Choose one package manager at initialization and commit its lockfile. Preferred direction: **pnpm** for workspace efficiency and deterministic project tooling.

Do not mix npm/yarn/pnpm lockfiles.

## Code quality

Baseline:
- TypeScript strict mode;
- ESLint;
- Prettier or one agreed formatter;
- typecheck in CI;
- unit/integration/E2E strategy from `TESTING-QUALITY-STRATEGY.md`;
- no `any` as an escape hatch without justification;
- typed environment-variable validation.

## Security utilities

Include as needed:
- rate limiting via Redis/Upstash;
- CSRF protections appropriate to auth architecture;
- secure headers/CSP;
- upload type/size validation;
- malware scanning strategy for high-risk uploads if introduced;
- secrets only in platform secret stores/env, never committed.

## Tool boundary rule

Libraries are selected for a responsibility, not because they are fashionable.

Before adding a dependency, document:
1. what problem it solves;
2. whether ScolaPro already has a tool for that responsibility;
3. its client bundle/runtime impact;
4. privacy implications;
5. whether it should sit behind an adapter/wrapper.

## Research notes

Current official documentation confirms:
- shadcn is open-code and supports AI-readable/customizable component ownership;
- shadcn currently supports Base UI, Radix and React Aria component bases;
- GSAP provides a React `useGSAP()` integration and scoped cleanup patterns;
- Upstash provides Redis and serverless-oriented rate-limiting tooling for Next.js;
- Trigger.dev provides long-running background jobs, retries, scheduling and realtime progress;
- PostHog provides product analytics, session replay, flags/experiments and related product tooling.

These findings support the architecture above but do not remove the need for privacy review before production configuration.