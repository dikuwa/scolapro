# ScolaPro continuation status — 2 September 2026

This file supplements `IMPLEMENTATION-STATUS.md` with the current post-31-August implementation state. It exists so another developer or AI does not repeat the report-card, statutory-readiness, subject-registration, detention, or deployment-audit work completed in the 2 September backend pass.

Authoritative repository checkpoint when this handoff was written: `cc1e916b1ac96be1b067f00f6f21d98d78124a15` on `main`.

## Report-card bulk workflow

**DONE IN CODE / PRODUCTION VERIFY**

The durable bulk report-card chain is implemented and regression-tested: Generate → Certify → Publish → Prepare PDFs → combined printable PDF. The runtime uses durable database jobs, immutable snapshots, private `report-card-artifacts` storage, SHA-256/page metadata, retry/dead/stale-lock recovery, short-lived signed document access, and a server-only worker boundary.

The management-page accelerator no longer treats failed worker requests as success. It stops on `401/403`, backs off transient failures up to 30 seconds, refreshes only after successful processing, and leaves durable worker/scheduler recovery as the source of truth.

Do **not** mark production browser/role QA complete yet. The connected Vercel team currently exposes zero projects through the connector, so the authoritative project/domain, production deployment SHA, server-only secrets, cron execution, runtime logs, large-scope behavior, and real role/browser flows remain `VERIFY`.

## Learner subject registration and readiness

**DONE IN CODE / NON-BLOCKING**

The repository now contains the complete non-blocking subject-registration readiness chain:

- authoritative learner subject-registration ledger;
- readiness source for statutory/reporting use;
- atomic bulk synchronization preserving registration identity/history;
- result-vs-registration reconciliation with explicit missing/unregistered/attention states;
- frozen reconciliation evidence inside report-card snapshots;
- allocation-scoped subject-registration reads for teaching staff;
- paged management readiness workspace and summary RPCs;
- governed bulk subject-registration import.

The governed import contract is explicit:

`admission_number + academic_year + subject_code + action`

`action` is `register` or `withdraw`. Learners resolve only by stable school admission number; names are never merge keys. Subject resolution requires the exact active school/year/learner-grade offering. Duplicate learner+offering rows fail closed. Commit uses the canonical register/withdraw RPCs so per-row lifecycle/audit behavior remains authoritative.

Import management follows the stricter school import boundary: Platform Admin, School Admin, Principal or Deputy Principal. HOD may manage learner subject registrations through the normal academic workflow but does **not** receive bulk-import commit authority.

Subject registration remains deliberately backward-compatible and non-blocking. Do not introduce hard report-card/result enforcement until migration/adoption rules are explicitly approved.

## Namibia AEC / EMIS readiness

**SOURCE-MODEL READINESS DONE / AUTHORITATIVE MAPPING VERIFY**

The uploaded AEC source reviewed during this pass appears to be an older form version and contains historical references. It may guide normalized source-model readiness, but it must not be treated as the current Ministry specification.

Repository readiness now covers operational grade/sex, class/sex, assignment gaps, register-class teacher governance, subject-registration counts, and related statutory source construction without fabricating unsupported Ministry fields.

Still `NEXT/VERIFY` pending a current authoritative Ministry source:

- current form revision and official identifiers/codes;
- full Form D staff particulars;
- class session / medium / multigrade structure;
- home language and feeding data;
- OVC, dropout, pregnancy and furniture domains;
- form-specific mapping/export rules.

Do not add a guessed global school-code constraint. Historical AEC examples are not sufficient evidence for current EMIS validation.

## Detention supervision and lifecycle hardening

**DONE IN CODE / FRONTEND SELF-SCOPED WORKSPACE NEXT**

The backend now treats detention supervision as a dated school-placement responsibility rather than a tenant-wide staff association.

Completed integrity work includes:

- supervisor eligibility/preferences are governed and auditable;
- deleting preference rows cannot silently restore eligibility;
- automatic/manual supervisor assignment validates actual detention due date;
- roll-forward repairs stale or expired supervisor assignments and records provenance;
- assigned due-date-valid supervisors may complete their own obligations, but ordinary supervisors may not waive them;
- `list_my_detention_supervision(...)` exposes only the signed-in active staff identity's own assignments, with bounded paging, minimal learner details, optional history and `can_complete` readiness;
- detention-session RLS and attendance/completion RPCs require the supervisor's school placement to cover the actual session date;
- completed and cancelled detention sessions are final against invalid re-completion;
- a session-item attendance outcome is a one-time `scheduled → attended|absent|excused` transition;
- `attended` completes an unresolved obligation once and emits the canonical `late_detention.resolved` audit trail with `detention_session_attendance` source metadata;
- final attendance outcomes receive their own durable audit event.

Frontend work is intentionally isolated in GitHub issue **#182 — My detention supervision UI**. That lane must use the self-scoped RPC, must never grant ordinary staff the management `/late-arrivals` workspace, and must never show Waive to an ordinary assigned supervisor.

The current automatic assignment notification still points to `/late-arrivals`. Once the self-scoped UI route exists, change that backend notification href in a separate backend migration/PR so frontend and backend branches do not overlap.

## Behavioral-integrity coverage already present

Do not duplicate earlier staff/parent QA:

- staff import effective-period reconciliation and overlap/idempotency were covered previously;
- tenant-wide staff identity reuse across schools plus repeat-import skip behavior were covered previously;
- reused-guardian sibling access, relationship expiry and guardian-account unlink isolation were covered previously;
- parent finance linked/unlinked child isolation and relationship-expiry revocation were covered previously.

Continue behavioral QA only where a new uncovered invariant is identified.

## Deployment and hosted-service verification

**HOSTED SUPABASE MIGRATION PARITY DONE AT THIS CHECKPOINT / RUNTIME VERIFY**

A read-only hosted Supabase migration audit on 2 September 2026 confirmed that project `jhgumnvhoxmapmgotchu` contains repository migrations through `20260902264000_detention_attendance_outcome_finality`, matching the latest database migration on `main` at checkpoint `cc1e916b...`. No migration was applied by this audit.

That confirms hosted migration parity at this checkpoint; it does **not** by itself prove Vercel/runtime/browser behavior. Recheck parity after later migration merges rather than assuming it remains current indefinitely.

The current Supabase security advisor still reports leaked-password/HIBP protection disabled. It also reports the expected broad family of exposed `SECURITY DEFINER` application RPCs; those warnings are not blanket defects because ScolaPro deliberately uses self-authorizing signed-in RPC boundaries. Audit individual functions and privilege tests rather than revoking application RPC execution wholesale. The anonymous invitation-preview RPC remains intentionally public.

The Vercel connector currently returns zero projects for the connected team. Therefore do not claim:

- a production ScolaPro deployment SHA;
- production cron execution;
- production worker secrets/configuration;
- production browser-role QA;
- production report-card renderer/export runtime validation.

## Current coordination rule

Backend/data/domain work: ChatGPT lane on a dedicated branch from latest `main`.

Bounded frontend/UI work: Codex lane on a separate branch, currently issue #182 for detention supervision UI.

Avoid touching the same files in parallel. Merge only after exact-head application CI and, for database changes, the full Database migration/reset/lint/pgTAP workflow are green.

## Recommended next sequence

1. Complete/merge the bounded issue #182 frontend lane after review without broadening authorization.
2. Align detention-assignment notification href after that route exists.
3. Continue behavioral-integrity audit only for genuinely uncovered domain invariants.
4. Recheck hosted Supabase migration parity after any subsequent database merge; current parity is confirmed through `20260902264000`.
5. Perform production/role browser QA once an authoritative Vercel project is visible/connected.
6. Enable and verify Supabase leaked-password protection before production onboarding when supported by the project plan.
7. Obtain a current authoritative Namibia AEC/EMIS source before form-specific mapping/export work.
8. Complete consolidated UI/IA/responsive release QA after operational foundations stabilize.
