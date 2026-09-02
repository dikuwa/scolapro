# Report-card deployment and operations verification

Last reviewed: **2 September 2026**

This note records the deployment/runtime verification state for ScolaPro's durable report-card workflow. It complements `IMPLEMENTATION-STATUS.md`; it does **not** replace production browser/role QA.

## Codebase verification — DONE

The current codebase has a complete durable runtime chain for report-card bulk work:

- Management actions create durable database batches and use a server-side `after(...)` worker kick so processing can start immediately without making the browser request the source of truth.
- `/api/report-card-batches/process` is an authenticated management-only accelerator. It may progress already-authorized durable work but does not return cross-school/global queue counts to the caller.
- `/api/internal/report-card-render` is the independent internal/scheduler recovery endpoint. `POST` requires `INTERNAL_JOB_RUNNER_SECRET`; scheduled `GET` requires `CRON_SECRET`. Missing secrets fail closed.
- `vercel.json` schedules a daily recovery invocation at `15 1 * * *`, which is compatible with the repository's documented Hobby-plan fallback strategy.
- Worker code uses the server-only Supabase service-role client. Service-role credentials are not exposed to browser modules and are documented as server-only in `.env.example`.
- Batch processing delegates to governed database RPCs and clamps processing limits.
- Render processing recovers stale claims, has retry/dead semantics, claims HTML and PDF jobs separately, renders immutable snapshots, stores artifacts in the fixed private `report-card-artifacts` bucket, records SHA-256 checksums/page counts, and reports completion/failure through governed RPCs.
- Combined-PDF export claims durable export work, requires completed learner items and ready learner PDFs, validates the fixed private artifact bucket, orders learner documents deterministically, stores one combined PDF, and records its checksum/page count.
- Individual document and combined-batch download routes authorize with the signed-in user's RLS-visible row **before** using the service-role client to mint a 90-second signed private-storage URL. Responses are `private, no-store`.
- The deterministic database lifecycle regression covers Generate → Certify → PDF preparation/render completion → combined export → Publish and verifies export gating before artifacts are ready.

## Runtime resilience correction — DONE

PR #171 corrected the management-page worker pulse. Previously, while durable work was active, the browser retried the processing endpoint every 2.5 seconds and refreshed the page even when the endpoint returned `401`, `403`, or `5xx`.

The pulse now:

- refreshes only after a successful worker response;
- stops on `401/403` when the session or management role is no longer valid;
- uses bounded exponential backoff for transient HTTP/network failures, capped at 30 seconds;
- returns to the normal 2.5-second acceleration interval after recovery.

This prevents a deployment/runtime failure from becoming a tight worker-request + page-refresh loop while preserving the durable queue and scheduler as the recovery source of truth.

## Deployment verification — VERIFY

The connected Vercel account currently exposes the team **Martin Mukoya's projects** on the Hobby plan but returns **zero projects** through the Vercel connector. Therefore the following must remain `VERIFY` rather than being marked complete:

- which Vercel project/domain is the authoritative ScolaPro production deployment;
- whether `main` at the expected SHA has actually been deployed;
- whether `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_JOB_RUNNER_SECRET`, and `CRON_SECRET` are present in the production environment;
- whether the configured cron is active and successfully invoking `/api/internal/report-card-render`;
- production function duration/runtime behaviour for large school-wide batches;
- production logs for retry, stale-lock recovery, renderer failures, export failures, and signed-document access;
- real browser role QA for School Admin, Principal, Deputy Principal, teacher/read-only status access, and guardian published-document access.

Do not infer any of these from a successful GitHub merge or CI run.

## Supabase deployment verification — VERIFY

GitHub `main` is the source of truth for migrations and tests, but a merge does not prove those migrations have been applied to the connected hosted Supabase project. Before production release, compare hosted migration state with repository `main` and run read-only/preflight checks where possible. Do not apply speculative DDL directly to production.

Supabase Auth leaked-password/HIBP protection is also a hosted Auth setting and remains `VERIFY`; it cannot be made true by a SQL migration alone.

## Namibia statutory data — VERIFY / NEXT

The reviewed uploaded AEC questionnaire is an older Ministry source and includes historical references. It is useful for source-model readiness but must not be treated as the current authoritative AEC/EMIS revision. Current Ministry form revision, identifiers/codes, and form-specific mappings remain `VERIFY/NEXT` until an authoritative current source is reviewed.

## Release gate

Report-card runtime code can be treated as **implemented and code-verified**, but production readiness requires all of the following before the deployment/role QA item can move from `VERIFY` to `DONE`:

1. identify/connect the authoritative Vercel ScolaPro project;
2. confirm production deployment SHA and required server-only secrets;
3. observe at least one scheduled recovery invocation and inspect runtime logs;
4. exercise seeded management roles through a durable bulk batch including a skipped learner and PDF export;
5. exercise teacher status-only access and guardian published-document access;
6. confirm hosted Supabase migration parity and relevant Auth configuration.

Until those gates are completed, documentation and status updates must say **code-verified / production VERIFY**, not “production complete.”
