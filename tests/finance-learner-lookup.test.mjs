import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = read("src/features/finance/finance-workspace.tsx");
const queries = read("src/features/finance/server/queries.ts");
const actions = read("src/features/finance/server/actions.ts");
const searchableSelect = read("src/components/ui/searchable-select.tsx");
const migration = read("supabase/migrations/20260920200000_finance_learner_lookup.sql");
const databaseTest = read("supabase/tests/finance_learner_lookup_scope_test.sql");

test("finance initial load keeps settings and latest 50 payments without school-wide learner preload", () => {
  assert.match(queries, /from\("school_payment_settings"\)/);
  assert.match(queries, /from\("finance_payments"\)/);
  assert.match(queries, /\.limit\(50\)/);
  assert.match(queries, /get_finance_payment_learner_labels/);
  assert.doesNotMatch(queries, /from\("enrolments"\)/);
  assert.doesNotMatch(queries, /from\("learners"\)/);
  assert.doesNotMatch(workspace, /learners\.map/);
});

test("finance learner lookup is a bounded server-backed action with the existing finance role contract", () => {
  assert.match(actions, /const financeRoles = new Set\(\["school_admin","principal","finance_officer","bursar"\]\)/);
  assert.match(actions, /export async function searchFinanceLearners/);
  assert.match(actions, /financeMembership\(parsed\.data\.schoolId\)/);
  assert.match(actions, /rpc\("search_finance_learners"/);
  assert.match(actions, /p_limit: 20/);
  for (const role of ["school_admin", "principal", "finance_officer", "bursar"]) assert.match(actions, new RegExp(role));
});

test("finance learner UI uses SearchableSelect without returning a full learner list to the browser", () => {
  assert.match(workspace, /from "@\/components\/ui\/searchable-select"/);
  assert.match(workspace, /<SearchableSelect/);
  assert.match(workspace, /onSearchChange=\{handleLearnerSearchChange\}/);
  assert.match(workspace, /loading=\{learnerSearchPending\}/);
  assert.match(workspace, /clearable/);
  const learnerControl = workspace.match(/<SearchableSelect[\s\S]*?className="sm:col-span-2"/);
  assert.ok(learnerControl, "expected the optional learner searchable control");
  assert.doesNotMatch(learnerControl[0], /<select/);
  assert.match(searchableSelect, /onSearchChange\?: \(query: string\) => void/);
  assert.match(searchableSelect, /loading\?: boolean/);
  assert.match(searchableSelect, /Searching…/);
});

test("finance learner lookup preserves optional school-level payments and canonical payment mutation", () => {
  assert.match(workspace, /name="learnerId"/);
  assert.match(workspace, /School-level \/ not linked/);
  assert.match(actions, /record_finance_payment/);
  assert.match(actions, /p_learner_id: parsed\.data\.learnerId \|\| null/);
  assert.match(actions, /revalidatePath\("\/school\/finance"\)/);
  assert.doesNotMatch(actions, /search_contribution_eligible_learners/);
});

test("finance lookup SQL is current/effective, max-20, school-scoped, and denies Platform Support", () => {
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 20\), 1\), 20\)/);
  assert.match(migration, /e\.status = 'current'/);
  assert.match(migration, /e\.enrolled_from <= v_today/);
  assert.match(migration, /e\.enrolled_to is null or e\.enrolled_to >= v_today/);
  assert.match(migration, /app_private\.can_manage_finance\(p_school_id\)/);
  assert.match(migration, /latest 50 finance payments/);
  for (const role of ["school_admin", "principal", "finance_officer", "bursar"]) assert.match(databaseTest, new RegExp(role));
  for (const phrase of ["cross school scope", "cross tenant scope", "Platform Support", "school-level payment", "learner-linked payment"]) {
    assert.match(databaseTest, new RegExp(phrase, "i"));
  }
});

test("finance surfaces retain responsive phone, tablet, and desktop contracts", () => {
  assert.match(workspace, /sm:grid-cols-2/);
  assert.match(workspace, /lg:grid-cols-2/);
  assert.match(workspace, /overflow-x-auto/);
  assert.match(searchableSelect, /min-w-0/);
  assert.match(searchableSelect, /min-h-10/);
});
