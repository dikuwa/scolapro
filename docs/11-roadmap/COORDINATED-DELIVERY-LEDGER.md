# Coordinated delivery ledger

Baseline: `186fd1cde778ff3ab872361b4a83cb42d03221bf` (`main`, 9 September 2026), including PR #381.

This ledger is governed with `docs/11-roadmap/CONTROL-ROOM.md`. Current source and connected-environment evidence override stale chat/roadmap status.

## Classification model

- **COMPLETE / INTEGRATED** — required source foundation is merged.
- **SOURCE-VERIFIED** — repository tests/CI or bounded audit verified the stated behavior.
- **DEPLOYMENT-GATED** — required source exists but is absent/unreconciled in the connected deployment.
- **SOURCE-GATED** — implementation waits for verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation waits for authoritative requirements.
- **LIVE-QA-GATED** — source/deployment exist but provider/browser/device/real-data acceptance is unverified.
- **ACTUAL IMPLEMENTATION GAP** — documented required behavior is absent from source and is not blocked by another gate.

## Current ownership

- Control Room / Integration — roadmap, merge order and shared-file coordination.
- Governance reconciliation — docs-only branch for the three roadmap governance documents.
- Deployment reconciliation — source/deployed migration parity and environment-specific runtime verification.
- UI consistency package — draft PR #382, separate from this governance lane.
- N06 — SOURCE-GATED.
- N11 — REQUIREMENTS-GATED.
- Paused document lane — report cards/documents/renderers/artifacts/branding until explicitly resumed.

PR #375 is merged and is not an active lane.

## Integrated sequence

- PR #353 — runtime stability audit/fix.
- PR #354 — N17/N18/N19 + T04/T05 bell/calendar foundation.
- PR #355 — N02/N03/N04 education-network hierarchy, identifiers and network roles.
- PR #357 — N05 statutory lifecycle workspace.
- PR #358 — N08 DNEA readiness/review.
- PR #359 — N13 staffing establishment/vacancy foundation.
- PR #360 — N14 staffing reconciliation.
- PR #361 — N21 official-result distributions/comparisons.
- PR #362 — N20 control forms.
- PR #363 — N15 hostel/feeding.
- PR #364 — N16 inclusion/SEN aggregate reporting.
- PR #365 — N09 examination-centre model.
- PR #366 — N10 examination-access arrangements.
- PR #367 — N08 readiness authorization/freshness hardening.
- PR #368 — N12 frozen examination registration/results ingest.
- PR #369 — N07 statutory operational snapshots.
- PR #370 — N24 canonical metric registry/network-safe aggregate foundation.
- PR #372 — governance reconciliation after N21/N24 foundation.
- PR #373 — N24 canonical metric expansion.
- PR #374 — N25 bounded circuit/regional operational analytics.
- PR #375 — UI/runtime consistency package; merged.
- PR #376 — historical network-authority hardening.
- PR #377 — governance reconciliation after operational QA/network analytics.
- PR #378 — guardian claim current-relationship hardening.
- PR #379 — LTSM/library canonical subject integrity and loan-return finality.
- PR #380 — finance invoice enrolment/terminal lifecycle hardening.
- PR #381 — platform tenant/school onboarding and invitation finality/idempotence hardening.

PR #371 was closed unmerged and is not source evidence.

## Connected deployment reconciliation

The connected `scolapro` Supabase migration ledger was re-read on 9 September 2026 during this reconciliation. It contains the late integrated roadmap/security slices through PR #381, including:

- bell/calendar foundation;
- education-network foundation/hardening;
- DNEA/statutory/staffing/control-form/hostel/inclusion/examination migrations;
- N24 canonical metric registry/expansion;
- N25 network operational analytics and current-membership hardening;
- guardian current-relationship claim hardening;
- LTSM return finality and canonical subject-reference integrity;
- finance invoice enrolment/terminal lifecycle hardening;
- examination comparison authorization correction;
- `20260909002000 platform_onboarding_invitation_hardening`.

Some deployed ledger versions/names reflect deployment reconciliation identity rather than the repository filename timestamp; do not replay DDL solely because timestamps differ. No current-main migration through PR #381 is classified DEPLOYMENT-GATED from the connected ledger evidence.

Environment-specific route/browser/provider acceptance remains LIVE-QA-GATED where not exercised.

## Roadmap classification

| ID | Classification | Remaining constraint |
|---|---|---|
| N01 | COMPLETE / STANDING RULE | Capture once; no parallel authoritative facts. |
| N02 | COMPLETE / INTEGRATED | Network hierarchy foundation. |
| N03 | COMPLETE / INTEGRATED | Versioned external school identifiers. |
| N04 | COMPLETE / SOURCE-VERIFIED | Current membership authorizes; historical `p_as_of` cannot revive expired authority. |
| N05 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Environment/role acceptance only. |
| N06 | SOURCE-GATED | Verified current Ministry Fifteenth School Day/AEC forms/mappings/rules absent. |
| N07 | COMPLETE / INTEGRATED | Canonical operational statutory snapshots. |
| N08 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | DNEA readiness source complete; environment acceptance remains. |
| N09 | COMPLETE / INTEGRATED | Examination centre independent from school. |
| N10 | COMPLETE / INTEGRATED | Restricted examination-access arrangements. |
| N11 | REQUIREMENTS-GATED | Authoritative subject/coursework/moderation requirements absent. |
| N12 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Frozen registration/results ingest; external Ministry/DNEA production contract not claimed. |
| N13 | COMPLETE / INTEGRATED | Staffing establishment/vacancy. |
| N14 | COMPLETE / INTEGRATED | Staffing reconciliation. |
| N15 | COMPLETE / INTEGRATED | Lean hostel/feeding. |
| N16 | COMPLETE / SOURCE-VERIFIED | Aggregate-only inclusion/SEN reporting. |
| N17 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Calendar teaching-impact source complete. |
| N18 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Effective-dated bell schedules source complete. |
| N19 | COMPLETE / SOURCE-VERIFIED | Bell fixtures/tests. |
| N20 | COMPLETE / INTEGRATED | Versioned/frozen/audited control forms. |
| N21 | COMPLETE / SOURCE-VERIFIED | Canonical official-result comparisons. |
| N22 | COMPLETE FOUNDATION; LIVE-QA-GATED | Shared school identity/print chrome exists; bounded document QA/polish remains. |
| N23 | COMPLETE ASSET BASELINE; LIVE-QA-GATED | Committed official assets exist; do not fabricate missing artwork. |
| N24 | COMPLETE / SOURCE-VERIFIED | Extend only for authoritative metrics/disclosure needs. |
| N25 | COMPLETE BOUNDED FOUNDATION / SOURCE-VERIFIED | Further Ministry/dashboard expansion requires explicit purpose/disclosure requirements. |
| N26 | COMPLETE / CLOSED | Requirement reconciliation complete. |

## Cross-domain post-#381 classification

| Area | Classification | Evidence / remaining work |
|---|---|---|
| Communications/notifications | SOURCE-VERIFIED; LIVE-QA-GATED | Recipient scope, outbox/retry/attempt/receipt and secret-free routing are source-verified; real provider send/webhook still requires configured-provider QA. |
| Guardian/parent flows | SOURCE-VERIFIED; LIVE-QA-GATED | PR #378 closes current active relationship claim defect; broader browser/real-data acceptance remains. |
| Platform onboarding/invitations | SOURCE-VERIFIED | PR #381 closes consumed invitation replay/finality defects; connected migration is present. |
| Finance/contributions | SOURCE-VERIFIED | PR #380 closes invoice enrolment/terminal lifecycle defects; connected migration is present. |
| LTSM/library | SOURCE-VERIFIED | PR #379 closes canonical subject and completed-return finality defects; connected migrations are present. |
| Statutory/DNEA | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N05/N07–N10/N12 foundations integrated; N06 remains separately source-gated. |
| Network analytics | COMPLETE / SOURCE-VERIFIED | N24/N25 foundations integrated/hardened; no generic expansion without source/purpose/disclosure contract. |
| Timetable/calendar | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N17–N19 integrated; browser/device operational acceptance may remain. |
| Staffing | COMPLETE / INTEGRATED | N13/N14 integrated. |
| Hostel/feeding | COMPLETE / INTEGRATED | N15 integrated. |
| Inclusion/SEN | COMPLETE / SOURCE-VERIFIED | N16 aggregate/non-leakage boundary integrated. |
| Examination workflows | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N08–N10/N12/N21 integrated; external production interfaces remain environment-specific. |
| Report cards/documents | COMPLETE FOUNDATION; LIVE-QA-GATED | Snapshot/publication/bulk/artifact/render foundations and N22/N23 baseline exist; bounded visual/print/browser QA remains. |

## Gates

### N06
**KEEP SOURCE-GATED.** Later merges add canonical statutory operational sources and generic mapping infrastructure but do not provide verified Ministry field definitions, codes, validation rules or official export layouts.

### N11
**KEEP REQUIREMENTS-GATED.** Existing assessment/moderation infrastructure does not establish authoritative coursework obligations by subject/year, evidence requirements or official moderation workflow/output rules.

## Remaining source-gap conclusion

No ungated roadmap-domain **ACTUAL IMPLEMENTATION GAP** was confirmed by the post-#381 repository reconciliation. The remaining work is gated or acceptance-oriented:

1. configured communications provider end-to-end live QA;
2. targeted browser/device/real-data QA for integrated workflows;
3. bounded document/reporting visual/print QA when that lane resumes;
4. N24/N25 extensions only when an authoritative metric/read-model need is defined;
5. N06/N11 only when their external gates are satisfied.

## Integration checklist

- Preserve source/deployment/live-QA distinctions.
- Never recreate source features to compensate for deployment drift.
- Never replay applied DDL solely because migration ledger timestamps differ.
- Require Database CI for migration-owning PRs and exact-head required CI before merge-ready status.
- Preserve one-owner rules for shared/high-conflict files.
- Use the mandatory Control Room handback template.