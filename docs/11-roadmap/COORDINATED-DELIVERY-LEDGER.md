# Coordinated delivery ledger

Baseline: `05f55fefffce2648634dcc85824aeb02164c01a8` (`main`, 9 September 2026), including PR #386.

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
- N06 — SOURCE-GATED.
- N11 — REQUIREMENTS-GATED.
- N22/N23 document QA — bounded visual/print QA only when explicitly assigned; preserve integrated foundations and PR #386 correction.

PRs #375 and #382 are merged and are not active UI lanes.

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
- PR #382 — UI consistency package for forms/loading/report settings/conduct/timetable; merged.
- PR #385 — T06 continuous expanded guardian-background visual correction.
- PR #384 — T07 avatar JPG/JPEG/PNG/WebP handling and diagnostics.
- PR #386 — N22/N23 shared browser-print pagination correction and bounded document QA.

PR #371 was closed unmerged and is not source evidence.

T08/T09 learner-photo behavior predates this sequence reconciliation and is already integrated in the ancestry of current `main`; commit `5e006ed7a8488ac3510c2eacefc8ab720e0ccc12` source-evidences immediate selected-photo preview, pending overlay/disabled replacement controls and actionable upload diagnostics. Related integrated learner-photo commits cover storage/link failure handling. These are evidence of existing source behavior, not a new implementation lane.

## Connected deployment reconciliation

The connected `scolapro` Supabase migration ledger was re-read on 9 September 2026 during the prior deployment reconciliation and contained the late integrated roadmap/security migration set through PR #381. PRs #382, #385, #384 and #386 add no database migrations.

Some deployed ledger versions/names reflect deployment reconciliation identity rather than the repository filename timestamp; do not replay DDL solely because timestamps differ. No migration gap is introduced by this UI/document reconciliation.

Environment-specific route/browser/provider acceptance remains LIVE-QA-GATED where not exercised. Source integration and CI evidence do not by themselves constitute live-browser, device, provider or production-data verification.

## T/C roadmap reconciliation

| ID | Classification | Remaining constraint |
|---|---|---|
| T01 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Per-school weekday/rotating cycle foundation exists; device/runtime acceptance may remain. |
| T02 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Dynamic day/grid/maintenance-label behavior exists; UI acceptance remains. |
| T03 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Calendar resolution/anchors integrated; operational acceptance remains. |
| T04 | COMPLETE / INTEGRATED | Numbered setup steps and “Anytime” teaching periods via PR #354. |
| T05 | COMPLETE / INTEGRATED | Configured subjects collapsed by default via PR #354. |
| T06 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | PR #385 integrates the continuous expanded guardian-background treatment. Source-level responsive/accessibility review exists; live browser/device visual acceptance was not claimed. |
| T07 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | PR #384 integrates avatar MIME normalization and JPG/JPEG/PNG/WebP diagnostics within the existing storage/authorization contract. Live provider/browser upload acceptance may remain. |
| T08 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Existing current-main ancestry source-evidences immediate learner-photo preview plus pending overlay/disabled photo actions; browser/device acceptance remains where not exercised. |
| T09 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Existing current-main ancestry source-evidences actionable learner-photo upload/link failure handling without reopening the upload architecture; provider/real-data/browser failure scenarios remain where not exercised. |
| T10 | LIVE-QA-GATED | CRC route/source migrations are present in the connected ledger; route/browser/runtime acceptance remains rather than deployment parity. |
| T11 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Official identity write boundaries are integrated; scenario acceptance may remain. |
| T12 | REQUIREMENTS-GATED | Optional administrator correction auto-approval remains a deferred product decision; no implementation should be inferred until explicitly adopted. |
| C01–C12 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Conduct domain/workflow is integrated; PRs #375/#382 are merged. Remaining acceptance is UI/browser/device oriented. |

## N-roadmap classification

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
| N22 | COMPLETE FOUNDATION; SOURCE-VERIFIED; LIVE-QA-GATED | PR #386 corrects shared browser-print pagination and continuation table headers. A representative 70-row A4 class-list fixture was source/visual exercised; live Chromium print, dark-theme print, app-generated PDF bytes and browser page-number/header parity were not verified. |
| N23 | COMPLETE ASSET BASELINE; SOURCE-VERIFIED; LIVE-QA-GATED | Committed official assets remain authoritative. PR #386 found Namib High crest/full-logo assets but no committed/configured large A4 backdrop; optional backdrop rendering was therefore not verified and no artwork is to be fabricated. |
| N24 | COMPLETE / SOURCE-VERIFIED | Extend only for authoritative metrics/disclosure needs. |
| N25 | COMPLETE BOUNDED FOUNDATION / SOURCE-VERIFIED | Further Ministry/dashboard expansion requires explicit purpose/disclosure requirements. |
| N26 | COMPLETE / CLOSED | Requirement reconciliation complete. |

## Cross-domain post-#386 classification

| Area | Classification | Evidence / remaining work |
|---|---|---|
| Communications/notifications | SOURCE-VERIFIED; LIVE-QA-GATED | Recipient scope, outbox/retry/attempt/receipt and secret-free routing are source-verified; real provider send/webhook still requires configured-provider QA. |
| Guardian/parent flows | SOURCE-VERIFIED; LIVE-QA-GATED | PR #378 closes current active relationship claim defect; PR #385 closes T06 source visual gap; broader browser/real-data acceptance remains. |
| Platform onboarding/invitations | SOURCE-VERIFIED | PR #381 closes consumed invitation replay/finality defects; connected migration is present. |
| Finance/contributions | SOURCE-VERIFIED | PR #380 closes invoice enrolment/terminal lifecycle defects; connected migration is present. |
| LTSM/library | SOURCE-VERIFIED | PR #379 closes canonical subject and completed-return finality defects; connected migrations are present. |
| Learner photo/profile | SOURCE-VERIFIED; LIVE-QA-GATED | T08/T09 behavior is already integrated/source-evidenced; browser/provider/real-data failure acceptance remains distinct. |
| Avatar/profile | SOURCE-VERIFIED; LIVE-QA-GATED | PR #384 closes T07 source gap; live upload/provider acceptance remains distinct. |
| Statutory/DNEA | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N05/N07–N10/N12 foundations integrated; N06 remains separately source-gated. |
| Network analytics | COMPLETE / SOURCE-VERIFIED | N24/N25 foundations integrated/hardened; no generic expansion without source/purpose/disclosure contract. |
| Timetable/calendar | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N17–N19 and PR #382 UI consistency integrated; browser/device operational acceptance may remain. |
| Staffing | COMPLETE / INTEGRATED | N13/N14 integrated. |
| Hostel/feeding | COMPLETE / INTEGRATED | N15 integrated. |
| Inclusion/SEN | COMPLETE / SOURCE-VERIFIED | N16 aggregate/non-leakage boundary integrated. |
| Examination workflows | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N08–N10/N12/N21 integrated; external production interfaces remain environment-specific. |
| Report cards/documents | COMPLETE FOUNDATION; SOURCE-VERIFIED; LIVE-QA-GATED | N22/N23 baseline plus PR #386 pagination correction are integrated. Live Chromium print, app-generated PDF bytes, dark-theme print and other unexercised visual/device scenarios remain QA gates rather than source gaps. |

## Gates

### N06
**KEEP SOURCE-GATED.** Later merges add canonical statutory operational sources and generic mapping infrastructure but do not provide verified Ministry field definitions, codes, validation rules or official export layouts.

### N11
**KEEP REQUIREMENTS-GATED.** Existing assessment/moderation infrastructure does not establish authoritative coursework obligations by subject/year, evidence requirements or official moderation workflow/output rules.

## Remaining source-gap conclusion

**No confirmed ungated roadmap ACTUAL IMPLEMENTATION GAP remains on current `main` through PR #386.**

T06 and T07 are merged via PRs #385/#384. T08/T09 were already integrated and are source-evidenced in current-main ancestry. PR #382 is merged. N22/N23 retain bounded LIVE-QA-GATED document acceptance after PR #386 rather than a reopened source-foundation gap.

Remaining work is SOURCE-GATED (N06), REQUIREMENTS-GATED (N11/T12), LIVE-QA-GATED, or explicit bounded extension/QA work. Do not create replacement implementation lanes for integrated source merely because a live browser, device, provider, app-generated PDF or production-data scenario has not yet been exercised.

## Integration checklist

- Preserve source/deployment/live-QA distinctions.
- Never recreate source features to compensate for deployment drift or missing live QA.
- Never replay applied DDL solely because migration ledger timestamps differ.
- Require Database CI for migration-owning PRs and exact-head required CI before merge-ready status.
- Preserve one-owner rules for shared/high-conflict files.
- Use the mandatory Control Room handback template.