# Control Room status — 1 October 2026

Authoritative main at reconciliation: `e5829820349fd85e4a7057247a65829867e980cb`.

This is the current Control Room handoff. Use it with `CONTROL-ROOM.md` and `IMPLEMENTATION-STATUS.md`. Earlier dated status files remain historical evidence only.

## Current disposition

- Production School Admin release acceptance is **GREEN** across the primary, management/governance, operations, learner/CRC/document and negative-role-boundary waves.
- Production database migration parity is **RECONCILED THROUGH CURRENT MAIN**.
- GitHub issue/PR queue is empty at this reconciliation point except this docs-only reconciliation issue.
- No paid staging/branching infrastructure is authorized.
- New implementation work must be justified by a concrete live defect, authoritative new requirements/source material, or a bounded security/performance finding.

## Completed since the 27 September status

- #666 — CLOSED / ACCEPTED. Multi-school report-card benchmark completed on localhost-only fixture: 3 schools, 36 learners, 72 jobs, 72/72 completed, zero active/dead jobs, exactly-once claims, cleanup PASS.
- #682–#687 — CLOSED.
- #693 — CLOSED / master post-brainstorm programme complete.
- #899 / PR #905 — localhost-only report-card benchmark runner merged.
- #901 / PR #906 — report-card HTML Storage MIME corrected.
- #907 / PR #908 — attendance mobile overflow corrected.
- #909 — primary production release acceptance closed green.
- #910 — Conduct production failure repaired by reconciling the six existing Conduct migrations.
- #911 — post-22-Sep production migration parity reconciled using existing repository migrations only.
- #912 — management/governance release wave green.
- #913 — School Admin operations release wave green.
- #914 / PR #915 — learner-subject workspace fixed; invalid `grades.sort_order` query replaced with canonical `display_name` ordering.
- #916 — learner detail/CRC/document-child/public-token safety wave green.
- #917 / PR #918 — mutable function search path hardened; public token-verification contracts preserved.
- #919 — leaked-password protection policy verified enabled in Supabase Auth; existing ScolaPro login/session remains healthy.
- #920 — remaining School Admin and negative role-boundary wave green.
- #921 / PR #922 — five `auth_rls_initplan` warnings eliminated without authorization changes.
- #923 / PR #924 — stale teaching-plan permissive RLS branches removed.
- #925 / PR #926 — registry/exam management `FOR ALL` policies split into write-only commands.
- #927 / PR #928 — five structural statutory registry RLS overlaps removed; assessment RLS intentionally preserved after pgTAP blocked an unsafe intermediate topology.
- #929 — this documentation reconciliation.

## Production verification summary

Authenticated Namib High School / School Admin production smoke passed for the primary school-management routes, including learner/staff/attendance/teaching, Class Lists, Conduct, Guardians, Library, Report Cards, Assessment, Calendar, Settings/Setup, Room Inventory, Sports Houses, Correspondence, Statutory, CRC custody, Academic Analysis, Absence Reviews, Late Arrivals, Invitations, Data Corrections, Contributions, Learner Subjects, Timetable, DNEA Readiness, School Directory, Imports, Finance, Offline and Detention Supervision.

Read-only Class List PDF preview passed with Namib High identity/crest and a real learner table.

Public invalid-token safety checks passed for `/verify/<invalid-token>` and `/join?token=<invalid-token>`.

Direct URL negative-role probes for Platform/Network routes fail closed for the School Admin session with no protected-data exposure.

## Database/security/performance state

- Production migration ledger contains all expected logical migrations from current main that were previously missing after 22 September.
- No duplicate repo migrations were invented during parity repair.
- Leaked-password protection is verified ON in Supabase Auth; existing ScolaPro sign-in/session remains healthy.
- Two anonymous SECURITY DEFINER functions remain intentional bounded public-token contracts.
- Authenticated SECURITY DEFINER notices require contract-by-contract review; do not bulk revoke.
- Supabase performance advisor:
  - `auth_rls_initplan`: **5 -> 0**
  - `multiple_permissive_policies`: **45 -> 17**
  - remaining 17 are intentional multi-role access boundaries unless a concrete redundant contract is proven.
  - unindexed foreign-key and unused-index INFO findings are not bulk-remediation targets without workload evidence.
- Final production backend 5xx sweep across the live-QA window returned no server errors.

## Remaining gates

- N06 — **SOURCE-GATED**. Do not invent Ministry/AEC/Fifteenth School Day fields, mappings, codes, rules or layouts beyond verified supplied source.
- N11 — **REQUIREMENTS-GATED**. Generic assessment mechanics do not substitute for authoritative subject/coursework/moderation requirements.
- T12 — **REQUIREMENTS-GATED**. Administrator correction auto-approval remains a product decision.
- Communications provider acceptance remains provider/live-config gated.
- Library real issue/return/lost/damaged acceptance remains real-data/role gated where production lacks suitable circulation fixtures.
- Teacher/HOD/Parent/other role-specific browser acceptance remains role-session gated where no honest credentials/memberships are available.
- Do not manufacture production fixtures or memberships solely to satisfy QA.

## Control Room next-work rule

Before opening new implementation:
1. verify current `main` and open issue/PR state;
2. prove a concrete implementation gap or live defect;
3. preserve one issue / one branch / one PR;
4. require exact-head Application CI, and Database CI for migration-owning work;
5. do not reopen integrated work merely because older status files are stale.
