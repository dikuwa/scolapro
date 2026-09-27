# Control Room status — 27 September 2026

Authoritative main: `501962946647210bdab7eca6cfb2834adb88e59b`.

This is the current delta over the 20 September release-hardening baseline. Use it with `CONTROL-ROOM.md` and `IMPLEMENTATION-STATUS.md`; do not reopen integrated work merely because those older documents contain historical sequencing language.

## Current disposition

- #649 — **CLOSED / ACCEPTED**. Realistic localhost repeated-route timings on restored Namib High data all passed the ~5 s threshold: Home 0.888 s, Learners 3.0 s, Staff 3.9 s, Attendance 2.8 s, Teaching 2.2 s, Guardians 3.0 s, Library 3.4 s, Report Cards 4.1 s. The larger protected shared-layout migration is not justified by current evidence.
- #666 — **OPEN / ENVIRONMENT-GATED**. Production report-card worker/RPC acceptance is complete. The remaining multi-school/end-of-term throughput and recovery benchmark requires an isolated non-production fixture environment. Supabase branching was not started because the connected organization is not on a branching-capable plan; no billable infrastructure is authorized.
- #682–#687 — **OPEN / SOURCE-INTEGRATED / RESPONSIVE-LIVE-QA-GATED**. Exact-head CI/source acceptance has already been completed and merged. Remaining acceptance is authenticated browser QA at 390 / 768 / 1440 only. Do not create duplicate implementation streams unless that QA exposes a concrete defect.
- #693 — umbrella Control Room programme remains open until the remaining acceptance gates above are dispositioned.
- #787 — this docs-only reconciliation issue.

## Post-brainstorm implementation state

Integrated work includes the canonical Teaching Group foundation, class-list workspace and later batch/multi-select refinements, teaching planning/preparation, HOD review, assessment configuration and mark grid, Professional Files, HOD Subject File, CRC lifecycle, transfer form, letterhead/correspondence and finalized-document communications.

The Class List multi-roster request is already integrated. Relevant follow-up work includes #770/#771, #776/#777, #778/#779 and #780/#781. Do not open a parallel roster implementation.

## Remaining acceptance routes

Responsive browser acceptance:

- #682 `/teaching/preparation` — Teacher/Class Teacher
- #683 `/teaching/reviews` — HOD/leadership with current review authority
- #684 `/assessment/schemes` — academic leadership
- #685 `/assessment/marks` and one concrete mark grid — authorized marks user
- #686 `/teaching/files` — Teacher/Class Teacher/HOD
- #687 `/teaching/subject-file` — HOD/Teacher with current subject scope

Required viewport widths: 390, 768 and 1440.

## Standing gates

- N06 remains SOURCE-GATED.
- N11 remains REQUIREMENTS-GATED.
- T12 remains REQUIREMENTS-GATED.
- Do not treat CI, migration parity or source audit as browser/device/live-data acceptance.
- Do not manufacture production fixtures solely to satisfy QA.
- Do not add billable staging infrastructure without explicit approval.

## Control Room decision

Remote-safe implementation work is currently exhausted. New code is justified only by:
1. a concrete responsive/browser defect from #682–#687;
2. a future isolated environment that unlocks #666 benchmarking; or
3. new authoritative requirements/source material for existing gated roadmap items.
