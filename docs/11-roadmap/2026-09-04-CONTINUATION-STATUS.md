# ScolaPro continuation status — 4 September 2026

This checkpoint continues `2026-09-02-CONTINUATION-STATUS.md` and records the authoritative state after the detention, communications and behavioral-integrity bulk passes. Use this file to avoid repeating completed work.

Authoritative `main` checkpoint when this file was created: `748233bbfd1dd3ecc409292b8a5353a394320d51`.

## Old-chart sequence status

1. **DONE — My detention supervision UI (#182).** The self-scoped `/my-detention-supervision` workspace is implemented and merged. Ordinary supervisors see only their own assignments and cannot waive obligations.
2. **DONE — detention notification href alignment.** Detention-assignment/duty notifications now route to the self-scoped workspace while unrelated management notices retain `/late-arrivals`.
3. **DONE FOR CURRENT HIGH-RISK TRANCHE — behavioral-integrity audit.** Multiple genuinely uncovered authorization/integrity boundaries were proven, regression-tested, merged and deployed. Do not continue indefinitely into low-value provenance hardening unless a concrete authorization or relationship invariant is shown to be missing.
4. **DONE THROUGH THIS CHECKPOINT — hosted Supabase parity.** Database-affecting merged work through lesson-preparation authority integrity has been applied to hosted project `jhgumnvhoxmapmgotchu` and verified after merge.
5. **BLOCKED — production/browser role QA.** The connected Vercel team currently exposes no ScolaPro projects through the connector. Do not claim production deployment SHA, production browser QA, cron/worker runtime verification or production role-flow validation until the authoritative Vercel project is visible.
6. **VERIFY/MANUAL SETTING — leaked-password protection.** Supabase security review has reported leaked-password/HIBP protection disabled. The currently available connected tooling does not expose an auth-setting write action, so this remains a hosting configuration task rather than a database migration.
7. **SOURCE CHECKPOINT COMPLETE / FORM MAPPING BLOCKED — AEC/EMIS.** See `docs/10-statutory/AEC-SOURCE-AUTHORITY.md`. Official Ministry sources were rechecked on 2026-09-04. The public Ministry EMIS surface exposes the 2025 Fifteenth School Day Report and AEC reports through 2023, but no current official AEC questionnaire was found. Keep source models form-agnostic and do not implement current form-specific mappings from third-party or old copies.
8. **NEXT AFTER SOURCE/DEPLOYMENT BLOCKERS — consolidated UI/IA/responsive release QA.** Perform against the current merged application once operational foundations and deployment access are stable.

## Completed behavioral-integrity tranche

The following boundaries were added after the earlier September 2 checkpoint and must not be re-audited as if they were missing:

- finance payment allocation learner relationship integrity;
- communications recipient account relationship integrity;
- learner-history effective-period integrity;
- attendance enrolment-period integrity;
- cumulative-record enrolment-period integrity;
- school membership ↔ staff account identity integrity;
- school notification recipient relationship integrity;
- audit-event actor relationship integrity;
- client-operation/idempotency receipt actor relationship integrity;
- communication-message author authorization integrity;
- lesson-preparation author authorization tied to the exact date-valid teacher allocation, while preserving leader/HOD/platform authority.

These changes all passed the established merge gate when database-affecting: application lint/typecheck/build plus migration apply, reset/seed, DB lint and the full pgTAP suite on the exact PR head.

## Important lesson-preparation authorization result

The lesson-preparation audit proved an actual authorization gap rather than a provenance-only issue. The earlier insert policy allowed `prepared_by_user_id = auth.uid()` without proving that the account owned the referenced teaching allocation. The database boundary now requires an ordinary teacher/class-teacher to match the exact date-valid allocated staff identity for the schedule. A different teacher at the same school cannot claim that schedule. School leaders/HODs and platform administrators retain intended authority.

## AEC / EMIS source rule

The existing source-agnostic statutory model is intentionally safe to continue using. It already includes grade/sex, class-group/sex, assignment-gap, staffing, subject-offering, attendance and resource dimensions, plus later register-class teacher readiness.

Do not create a supposedly current AEC form schema, field numbering, page layout, code list or export layout until the current official questionnaire/package is obtained from the Ministry/EMIS or another authoritative government source with edition provenance. Third-party copies may be used for discovery only.

## Current blockers that should not trigger speculative code

- No authoritative Vercel project is visible to connected tooling.
- No current official AEC questionnaire was found on the Ministry public EMIS/download surface as of 2026-09-04.
- Leaked-password/HIBP protection is a hosting/Auth configuration setting, not something to fake through SQL.

If one of these dependencies becomes available, resume exactly at that blocked checkpoint rather than redoing completed backend work.

## Coordination rule

Start every new code branch from latest `main`. Keep bounded frontend/UI work and backend/data work isolated when parallel development is used. Do not touch the same files concurrently. For database-affecting branches, merge only after the exact-head application and full database gates are green, then recheck hosted migration parity.
