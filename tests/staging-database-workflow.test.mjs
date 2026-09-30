import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/staging-database.yml", "utf8");

test("staging bridge validation derives repository totals dynamically", () => {
  assert.match(workflow, /bridge_count="\$\{#bridge_files\[@\]\}"/);
  assert.match(workflow, /bridge_suffix_count="\$\(wc -l < \/tmp\/scolapro-bridge-suffixes\.txt/);
  assert.match(workflow, /"\$duplicate_count" -ne "\$bridge_suffix_count"/);
  assert.doesNotMatch(workflow, /Expected (?:exactly )?\d+ (?:staging-history bridge files|unique canonical duplicate versions)/);
});

test("each bridge suffix allows historical aliases but exactly one canonical migration", () => {
  assert.match(workflow, /bridge_matches=0/);
  assert.match(workflow, /canonical_candidates=\(\)/);
  assert.match(workflow, /"\$bridge_matches" -lt 1 \|\| \$\{#canonical_candidates\[@\]\} -ne 1/);
  assert.match(workflow, /one or more historical bridges and exactly one canonical migration/);
});

test("staging mutation steps remain explicitly gated", () => {
  assert.match(workflow, /name: Reconcile duplicate migration versions\n\s+if: \$\{\{ inputs\.confirmation == 'RECONCILE' \}\}/);
  assert.match(workflow, /name: Apply pending migrations\n\s+if: \$\{\{ inputs\.confirmation == 'DEPLOY' \}\}/);
  assert.match(workflow, /name: Preview pending migrations\n\s+run: supabase db push --linked --dry-run --include-all/);
});