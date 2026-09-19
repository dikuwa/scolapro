import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = source("src/app/reports/report-cards/page.tsx");
const workspace = source("src/features/reporting/paged-report-card-management.tsx");
const parentPortal = source("src/features/parents/server/portal.ts");
const documentRoute = source("src/app/api/report-card-documents/[documentId]/route.ts");
const exportRoute = source("src/app/api/report-card-batches/[batchId]/export/route.ts");
const snapshotBase = source("supabase/migrations/20260828111718_report_card_snapshots.sql");
const attendance = source("supabase/migrations/20260828234328_report_card_term_attendance_semantics.sql");
const subjectReadiness = source("supabase/migrations/20260902210000_report_card_subject_readiness_snapshot.sql");
const templateProfile = source("supabase/migrations/20260904190000_report_card_template_profile_snapshot.sql");
const publicationIntegrity = source("supabase/migrations/20260829113000_report_card_publication_integrity.sql");
const currentScope = source("supabase/migrations/20260919123000_report_card_certification_publication_current_scope.sql");

test("snapshots freeze approved-result, attendance, rule and template provenance", () => {
  assert.match(snapshotBase, /official_result_id/);
  assert.match(snapshotBase, /assessment_scheme_version/);
  assert.match(snapshotBase, /academic_rule_set_version/);
  assert.match(snapshotBase, /calculation_snapshot/);
  assert.match(attendance, /expected_school_days/);
  assert.match(subjectReadiness, /subject_result_readiness/);
  assert.match(templateProfile, /report_card_settings/);
  assert.match(templateProfile, /report_terms/);
});

test("certified and published report payloads are immutable historical versions", () => {
  assert.match(publicationIntegrity, /Certified report-card snapshot content is immutable/);
  assert.match(publicationIntegrity, /snapshot_version/);
  assert.match(publicationIntegrity, /status='superseded'/);
  assert.match(publicationIntegrity, /Only certified report-card snapshots can be published/);
});

test("parent surface requests published snapshots only", () => {
  assert.match(parentPortal, /\.eq\("status", "published"\)/);
  assert.doesNotMatch(parentPortal, /\.eq\("status", "draft"\)/);
  assert.match(parentPortal, /Unable to load published reports/);
});

test("publication current-scope hardening excludes stale school managers and Platform Support", () => {
  assert.match(currentScope, /user_targets_current_school/);
  assert.match(currentScope, /staff_member_covers_school_period/);
  assert.match(currentScope, /role_key='platform_admin'/);
  assert.doesNotMatch(currentScope, /role_key='platform_support'/);
  assert.match(currentScope, /Report-card publisher is not authorized for school/);
});

test("print and export routes are read-only artifact delivery", () => {
  assert.match(documentRoute, /export async function GET/);
  assert.match(exportRoute, /export async function GET/);
  assert.match(documentRoute, /createSignedUrl/);
  assert.match(exportRoute, /createSignedUrl/);
  assert.doesNotMatch(documentRoute, /\.update\(|\.insert\(|\.delete\(/);
  assert.doesNotMatch(exportRoute, /\.update\(|\.insert\(|\.delete\(/);
});

test("management UI exposes lifecycle pending feedback and responsive primitives", () => {
  assert.match(workspace, /Certifying…/);
  assert.match(workspace, /Publishing…/);
  assert.match(workspace, /Preparing…/);
  assert.match(workspace, /Choose any current learner/);
  assert.match(workspace, /flex flex-wrap/);
  assert.match(page, /sm:grid-cols-3/);
});

test("platform memberships are separated from school report-card workspace", () => {
  assert.match(page, /if \(context\.platformMemberships\.length\) redirect\("\/"\)/);
});

test("N11 remains untouched by report-card lifecycle QA", () => {
  assert.doesNotMatch(currentScope, /coursework|moderation requirement|N11/i);
  assert.doesNotMatch(page, /official Ministry|official NIED/i);
});
