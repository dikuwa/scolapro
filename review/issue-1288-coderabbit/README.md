# ScolaPro Issue #1288 CodeRabbit review package

This package is a read-only snapshot for independent source and visual review. It contains no repository checkout, dependencies, database data, environment files, authentication state, tokens, or credentials.

## Source identity

- Repository: `dikuwa/scolapro`
- Issue: [#1288](https://github.com/dikuwa/scolapro/issues/1288)
- Branch: `codex/issue-1288-sports-year-context`
- Approved baseline: `876e4afcb63caf131aec18f0dd4d05b0b3a83c8e`
- HEAD: `ba2d63fafeda52abed433a8cd66b6400ea044630`
- HEAD tree: `13c1ebcf81e19ac0727d052b4c6acb89e39b7ef7`
- Current tracked worktree changes: `e2e/sports-year-context.spec.ts`, `src/features/sports-houses/sports-houses-workspace.tsx`
- Baseline-to-worktree paths (exactly four):
  - `e2e/sports-year-context.spec.ts`
  - `src/features/sports-houses/sports-houses-workspace.tsx`
  - `tests/issue-1288-sports-year-context.test.mjs`
  - `tests/sports-houses-operational-completion.test.mjs`

## Contents

- `source/`: complete snapshots of the four changed source/test files, preserving current uncommitted content.
- `source/issue-1288.patch`: binary-safe diff against the approved baseline, restricted to the four paths above.
- `screenshots/`: 30 screenshots from the final passing synthetic Playwright run; six viewport/theme combinations, five UI states each.
- `evidence/qa-summary.txt`: sanitized final test and QA summary.
- `evidence/playwright-result.json`: minimal final Playwright status.
- `MANIFEST.json`: file list, sizes, and SHA-256 hashes.
- `SHA256SUMS`: SHA-256 for each package file other than this checksum list itself.

## Exclusions and privacy scan

Only whitelisted source files, the scoped patch, summarized test results, minimal Playwright status, and the 30 screenshots are included. No `.env`, tokens, credentials, database dumps, learner PII, browser storage state, or unrelated project files are packaged. Screenshot OCR was checked for identifying values; only synthetic seeded school context and visible control/validation labels appeared.

## Review request

Review the four source paths and patch for Issue #1288 scope, permission checks, school approval and year bounds, validation/error preservation, focus/cancel behavior, tenant isolation, and preservation of age/roster calculations. Visually review the responsive screenshots. Return an independent verdict with file/line findings. This package itself is not an approval, PR, or release artifact.
