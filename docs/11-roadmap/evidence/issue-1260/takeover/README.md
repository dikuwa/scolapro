# Codex takeover — PR #1261

Preserves accepted commit `dbba6d3f71cbfc8a17f42aee5908ef923389f566` and the parent evidence pack unchanged. Worktree: `ScolaPro-1260-codex`, branch `codex/issue-1260-takeover`, tracking the existing PR branch. Recovered and inspected CodeBuddy's uncommitted header/footer work without changing its worktree.

Source head: `dbcab876e395d138216021188fed8662f9963dfb`. Independent reviewer: APPROVED for that exact head, no blocking findings; independently rendered dense complete-profile PDFs for 50/70 learners on A2 and 80/90/100/120 on A1.

## Diagnosis

The accepted code already routes effective governed decisions into every one-sheet mark and count. NO_TEACHING produces no mark and zero daily/weekly/term contribution. No production defect or screenshot provenance was established. The new tests make October 5 explicit; no calendar arithmetic, weekly/paginated renderer or shared resolver was changed. Published counts are reference metadata, never an attendance override. An authorized NORMAL reopening takes precedence even when a closure label remains in source evidence.

The old screenshot fixture had empty contactLines/postalLines. Runtime already uses the authorized live document_profile loader and shared official header. Complete synthetic profile tests and evidence now show configured crest, school name, EMIS, physical/postal address, telephone, fax and email. Missing fields are omitted.

Footer caption and red reconciliation share one compact baseline in HTML/print/PDF. PDF wraps within the reserved footer band and rejects overflow rather than truncating. A2/A1 margins, inset and font floors remain unchanged.

## Evidence

Run `node docs/11-roadmap/evidence/issue-1260/takeover/generate.mjs` from the repo root. Synthetic-only renderer fixtures include baseline65, Oct5 closure64, Oct5+Oct14 closure63, replacement Saturday66, and A1. No production access, new dependency or migration.

Full Node suite: 1721 tests, 1720 passed, 0 failed, 1 skipped. Hosted CI/E2E status and final handback are recorded on PR #1261. Local E2E encountered password-rotation redirects in the existing local synthetic account environment; this is not claimed as a pass.

The first visual run (baseline A2/A1/replacement Saturday) passed all 13 invariants. Expanded holiday outputs and measurements belong to this directory; consult measurements.json for final generated results. Prior evidence is retained in the parent directory.

Not checked: production data, production browser, physical printer, owner acceptance of final visuals. Deferred future-absence feedback and preview/print width difference remain out of scope. No merge/deploy authorized.
