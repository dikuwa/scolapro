# Final one-sheet visual contract — Control Room 6701488793

Continuation of PR #1261, preserving prior commits and evidence. No calendar arithmetic, authorization, school-profile loader or weekly/paginated renderer changes.

Each closed date has one grey learner-body band with the complete centered rotated closure name, no index, no attendance mark and no duplicate list. A 7pt label determines the minimum learner-band height; impossible labels use the established explicit paginated fallback. The date remains chronological and grey; excluded daily totals remain blank/zero. Sparse and empty sheets retain compact headers and summary rows; empty PDF date columns match HTML. The website iframe gets a 4px outer gutter for full-term mode only; HTML screen body has a small outer gutter, and print/PDF margins and inset stay32pt+10pt.

## Reproduce

From repository root: `node docs/11-roadmap/evidence/issue-1260/final-visual/generate.mjs`. Uses installed Google Chrome with a fresh automation profile, synthetic data only, shipping renderers. Print-media emulation is explicitly restored before generating Chromium PDFs.

Cases:0/1/35/90 learners per gender, Oct5 NO_TEACHING,64/63-day cases,65-day no-closure baseline, authorized replacement Saturday, A2 and A1. The filename a2-roster-90 names its Term3 fixture; its actual planned paper is A1. Screen and print label bounds/vertical centering are asserted for every closure. measurements.json checks gender pages, full-profile header, PDF margins, footer baseline, reconciliation and screen/print/pdf-lib parity. No optional closure note is needed because the full name appears inside the band.

44 focused tests passed, including0/1/35/90-roster PDF/full-name regressions. Full Node run:1725 tests,1724 passed,0 failed,1 skipped. Typecheck and changed-file lint passed. Exact final hosted checks and independent review are linked in the PR handback. The reviewer independently rasterized the corrected zero-roster Girls print page.

A first sparse screenshot exposed inherited header/summary row heights; source corrected before acceptance. A first print harness run forced screen media and created a blank page; harness corrected and artifacts regenerated. Earlier failed outputs are not acceptance evidence.

Not checked: production data/browser, physical printer or final owner acceptance. No merge/deployment/migration.
