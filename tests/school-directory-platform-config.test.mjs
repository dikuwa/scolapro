import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const directoryWorkspace = source("src/features/school-directory/school-directory-workspace.tsx");
const directoryQueries = source("src/features/school-directory/server/queries.ts");
const platformPage = source("src/app/platform/tenants/page.tsx");
const platformEditor = source("src/features/platform/tenant-configuration.tsx");
const platformActions = source("src/features/platform/server/actions.ts");
const platformQueries = source("src/features/platform/server/tenants.ts");
const migration = source("supabase/migrations/20260918190000_school_directory_platform_configuration.sql");
const dbTest = source("supabase/tests/school_directory_platform_configuration_test.sql");

test("directory shows an honest missing-principal state without manual principal identity fields", () => {
  assert.match(directoryWorkspace, /Principal not configured/);
  assert.match(directoryWorkspace, /Principal identity is derived from current staff placement and role membership/);
  assert.match(directoryWorkspace, /href="\/staff"/);
  assert.match(directoryWorkspace, /href="\/school\/invitations"/);
  assert.doesNotMatch(directoryWorkspace, /name="principalName"/);
  assert.match(directoryQueries, /canManageStaffAccess/);
  assert.match(directoryQueries, /roleKey === "school_admin"/);
});

test("platform tenant configuration preserves immutable identifiers and uses shared controls", () => {
  assert.match(platformPage, /PlatformTenantConfiguration/);
  assert.match(platformPage, /getPlatformNetworkOptions/);
  assert.match(platformEditor, /Slug: \{tenant\.slug\} · fixed identifier/);
  assert.doesNotMatch(platformEditor, /name="tenantSlug"/);
  assert.doesNotMatch(platformEditor, /name="tenantId"[^>]*type="text"/);
  assert.match(platformEditor, /<Picker/);
  assert.match(platformEditor, /<DateField/);
  assert.doesNotMatch(platformEditor, /<select/);
});

test("platform edit actions are platform-admin-only and call governed RPCs", () => {
  assert.match(platformActions, /requirePlatformAdmin/);
  assert.match(platformActions, /membership\.roleKey === "platform_admin"/);
  assert.doesNotMatch(platformActions, /requirePlatformAdmin[\s\S]{0,300}platform_support/);
  for (const rpc of [
    "update_platform_tenant_configuration",
    "update_platform_school_configuration",
    "configure_school_network_assignment",
  ]) assert.match(platformActions, new RegExp(rpc));
});

test("platform school configuration uses canonical network references and merged public contact profile", () => {
  assert.match(platformQueries, /school_network_assignments/);
  assert.match(platformQueries, /education_regions/);
  assert.match(platformQueries, /education_circuits/);
  assert.match(platformQueries, /education_circuit_region_history/);
  assert.match(migration, /setting_key = 'document_profile'/);
  assert.match(migration, /v_profile := coalesce\(v_profile, '\{\}'::jsonb\)\s*\|\| jsonb_build_object/);
  assert.match(migration, /inspector contact remains managed by authorized schools/i);
});

test("network configuration is effective-dated, audited by the existing network trail, and cross-tenant bound", () => {
  assert.match(migration, /School not found in tenant/);
  assert.match(migration, /set effective_to = p_effective_from - 1/);
  assert.match(migration, /education_circuit_region_history/);
  assert.doesNotMatch(migration, /delete from public\.school_network_assignments/);
  assert.match(dbTest, /prior assignment is closed rather than deleted/);
  assert.match(dbTest, /Platform Support cannot mutate school network assignment/);
  assert.match(dbTest, /cross-tenant school configuration is denied/);
  assert.match(dbTest, /stale principal placement does not produce a derived directory principal/);
  assert.match(dbTest, /directory principal is derived once membership, active identity and effective placement are all current/);
});

test("directory allowlist is untouched by platform configuration", () => {
  assert.doesNotMatch(migration, /create or replace function public\.search_school_directory/);
  assert.doesNotMatch(platformEditor, /principal_public_email|principalPublicEmail/);
});
