# Issue #488 — Teaching Print Pack

The teaching print/export slice is a presentation layer over canonical teaching records. It does not create a second teaching-document store and does not mutate preparation, review, readiness, schedule or coverage state.

## Sources

The pack is assembled from existing governed records:

- `lesson_preparations`
- `teaching_schedule_items`
- `pacing_plan_items` / `pacing_plans`
- `teacher_allocations`
- curriculum registry content
- `teaching_actuals`
- configured academic year/term records

The same RLS/read scope that governs those records governs export visibility. Platform roles are explicitly excluded from the school-operational export endpoint. The endpoint uses only the deterministic current-school memberships returned by `getUserContext()`.

## Presentation

HTML and PDF export reuse the shared N22/N23 document foundation:

- shared school identity/header;
- shared A4 geometry;
- shared metadata/footer;
- shared PDF resources and page numbering;
- shared print page-break behavior.

The output includes teacher, subject, grade/class, academic year, configured term when available, generation timestamp, preparation ID, plan ID and review timestamps where present. Missing facts are rendered as absent rather than inferred.

The layout is a ScolaPro teaching-record export and is **not represented as an official NIED or Ministry form**.

## Verification boundary

Repository regression coverage verifies canonical-source use, no mutation path, shared renderer reuse, current-school/platform boundaries and provenance fields. Exact browser pagination, printer behavior and PDF appearance on physical devices remain **LIVE-QA-GATED**.
