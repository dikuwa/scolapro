import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = source("src/app/statutory/page.tsx");
const loading = source("src/app/statutory/loading.tsx");
const error = source("src/app/statutory/error.tsx");
const actions = source("src/features/statutory/server/actions.ts");
const mapping = source("supabase/migrations/20260828221746_statutory_mapping_compiler.sql");
const finality = source("supabase/migrations/20260902131500_statutory_form_provenance_finality.sql");
const network = source("supabase/migrations/20260907140000_statutory_n05_network_review.sql");
const operational = source("supabase/migrations/20260908093000_statutory_operational_snapshot_n07.sql");
const hardening = source("supabase/migrations/20260919105000_statutory_current_scope_hardening.sql");

test("statutory preparation UI excludes Platform Support and preserves Platform Admin governance", () => {
  assert.match(page, /m\.roleKey === "platform_admin"/);
  assert.doesNotMatch(page, /\["platform_admin", "platform_support"\]\.includes/);
});

test("statutory preparation is current-school and effective-placement bound", () => {
  assert.match(hardening, /user_targets_current_school/);
  assert.match(hardening, /staff_member_covers_school_period/);
  assert.match(hardening, /role_key in \('school_admin','principal','deputy_principal','emis_officer'\)/);
  assert.match(hardening, /role_key='platform_admin'/);
  assert.doesNotMatch(hardening, /role_key='platform_support'/);
});

test("network statutory review remains separately read-only", () => {
  assert.match(network, /can_view_school_via_network/);
  assert.match(network, /for select to authenticated/);
  assert.doesNotMatch(network, /for (insert|update|delete|all)/i);
});

test("historical statutory payload and form schemas remain versioned and immutable", () => {
  assert.match(finality, /Approved or published statutory form schema is immutable; create a new form version/);
  assert.match(mapping, /mapping_schema_snapshot/);
  assert.match(mapping, /v_version\.mapping_schema/);
  assert.match(operational, /generate_statutory_snapshot/);
  assert.match(operational, /reference_date/);
});

test("generic compiler remains declarative and does not encode Ministry form fields", () => {
  assert.match(mapping, /source_path/);
  assert.match(mapping, /target_path/);
  assert.match(mapping, /does not encode Ministry\/AEC field names/);
  assert.doesNotMatch(mapping, /Fifteenth School Day field|AEC field code|Ministry field code/i);
});

test("statutory workspace states and responsive primitives remain present", () => {
  assert.match(page, /No reporting cycles in your scope/);
  assert.match(page, /Unable to load statutory reporting lifecycle/);
  assert.match(loading, /RouteLoadingIndicator/);
  assert.match(error, /Statutory reporting unavailable/);
  assert.match(page, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(page, /lg:grid-cols-/);
  assert.match(page, /sm:flex-row/);
});

test("workspace copy keeps N06 generic and does not claim official Ministry forms", () => {
  assert.match(page, /This workspace does not define Ministry forms or mappings/);
  assert.doesNotMatch(page, /official Ministry form/i);
  assert.doesNotMatch(actions, /official Ministry form/i);
});

test("compile/certify actions remain snapshot lifecycle operations rather than source mutation", () => {
  assert.match(actions, /compile_statutory_mapping/);
  assert.match(actions, /certify_statutory_snapshot/);
  assert.doesNotMatch(actions, /\.from\("(learners|staff_members|enrolments)"\)\.update/);
});
