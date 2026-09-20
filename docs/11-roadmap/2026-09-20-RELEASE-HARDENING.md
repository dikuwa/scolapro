# Release hardening — 20 September 2026

Authoritative release baseline: `7ad6aefd1fe505e01240f94cfe6fb12867b0bd86`.

Tracking issue: #598 — CLOSED with RELEASE GO. Follow-on offline expansion: #602.

## Release disposition

ScolaPro completed release hardening and is deployed with RELEASE GO. This document is retained as the release record; new offline-first implementation continues under #602.

### Blocking / gated work

| Issue | Classification | Required closure |
|---|---|---|
| #577 | RELEASE BLOCKER | Authenticated valid-teaching-day attendance submit → authoritative DB row → reload → Attendance Review acceptance. Do not replace persistence with client-only cache. |
| #590 | GOVERNANCE BLOCKER | Resolve account/canonical staff identity authority using governed reconciliation evidence. Do not merge by name or manually move Auth identity. |
| #561 | LIVE-QA-GATED | Authenticated Absence Reviews role/responsive acceptance only. Source audit is already complete. |
| #562 | LIVE-QA-GATED | Authenticated Library/Textbooks role/circulation/responsive acceptance only, using safe existing data. |

## Performance baseline

Connected production shows material database latency in real application reads. High-cost examples observed on 20 September include:
- enrolment lookup by `school_id + academic_year + status` with mean execution above 1.6 s in sampled `pg_stat_statements`;
- guardian directory/profile/contact/address reads with repeated 200–700 ms mean execution;
- `search_guardian_directory` around 700 ms mean execution;
- `list_conduct_learners` around 288 ms mean execution.

Supabase performance advisors also report a large backlog of unindexed foreign keys. Do not address all findings blindly. Optimize only indexes/query plans tied to measured application paths and verify with `EXPLAIN (ANALYZE, BUFFERS)` or equivalent before/after evidence.

Frontend hardening must minimize shipped client JavaScript on core school workflows. Large `"use client"` workspaces exist in teaching, reporting, attendance, library and timetable surfaces; split only where it measurably reduces initial route work without changing behavior.

## Offline-first baseline

ADR-0005 and `docs/09-architecture/OFFLINE-SYNC-ARCHITECTURE.md` are authoritative.

Current source has:
- installable web manifest;
- attendance client mutation IDs and server idempotency semantics;
- no service-worker implementation;
- no IndexedDB scoped cache;
- no durable business mutation queue;
- no connectivity/sync/conflict UI.

Classification: **ACTUAL IMPLEMENTATION GAP**.

Phase 1 release target:
1. PWA application-shell service worker for static/stable assets only;
2. IndexedDB stores scoped by user/tenant/school;
3. durable mutation queue and sync metadata/conflict records;
4. Online / Offline-saved-on-device / Syncing / Needs-attention UX;
5. daily-register attendance as first queued authoritative mutation;
6. retry uses the existing client mutation ID and server remains authoritative;
7. cache cleared on logout or school/user context change;
8. evidence-file uploads remain online-first until safe blob queue semantics are implemented.

No privileged certification, role mutation, destructive administration, statutory finality or result unlocking is offline-capable in Phase 1.

## Release candidate gate

Before the final deployment:
- exact-head Application CI PASS;
- exact-head Database CI PASS for any DB/migration changes;
- source/live migration parity confirmed;
- Supabase security and performance advisors reviewed;
- #577 and #590 dispositioned;
- available #561/#562 live acceptance executed without manufactured production fixtures;
- build/env/cron secrets reviewed;
- one final production deployment only when Vercel quota permits;
- post-deploy critical-route smoke + production DB verification.

Final Control Room output is GO or NO-GO, with remaining external gates listed explicitly.
