import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dev = readFileSync("scripts/run-local-dev.mjs", "utf8");
const seed = readFileSync("scripts/seed-local-auth.mjs", "utf8");
const recovery = readFileSync("scripts/recover-hosted-school-data.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
const gitignore = readFileSync(".gitignore", "utf8");

test("default development resolves credentials from the loopback Supabase stack", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/run-local-dev.mjs");
  assert.match(dev, /supabase", \["status", "-o", "json"\]/);
  assert.match(dev, /NEXT_PUBLIC_SUPABASE_URL: status\.API_URL/);
  assert.match(dev, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status\.PUBLISHABLE_KEY/);
  assert.match(dev, /SUPABASE_SERVICE_ROLE_KEY: status\.SERVICE_ROLE_KEY/);
  assert.match(dev, /Refusing to use a non-loopback Supabase URL/);
  assert.equal(packageJson.scripts["local:sync-db"], "supabase migration up --local");
  assert.match(dev, /execFileSync\("supabase", \["migration", "up", "--local"\]/);
  assert.match(dev, /Local Supabase migrations are not current/);
  assert.match(dev, /pnpm local:sync-db/);
});

test("local Auth provisioning is explicit, password-gated and loopback-only", () => {
  assert.match(seed, /SCOLAPRO_LOCAL_ADMIN_PASSWORD/);
  assert.match(seed, /password\.length < 12/);
  assert.match(seed, /Refusing to seed Auth outside the local Supabase stack/);
  assert.match(seed, /role_key: "school_admin"/);
  assert.match(seed, /\.from\("schools"\)/);
  assert.match(seed, /tenant_id: school\.tenant_id/);
  assert.match(seed, /Local demo school tenant does not match the repository seed/);
  assert.doesNotMatch(seed, /https:\/\//);
});

test("Next 16 generated types are stable without tracking generated next-env", () => {
  assert.equal(tsconfig.compilerOptions.jsx, "react-jsx");
  assert.ok(tsconfig.include.includes(".next/dev/types/**/*.ts"));
  assert.match(gitignore, /^next-env\.d\.ts$/m);
});


test("hosted data recovery is pinned to the known source and loopback target", () => {
  assert.equal(packageJson.scripts["local:recover-hosted-data"], "node scripts/recover-hosted-school-data.mjs");
  assert.match(recovery, /jhgumnvhoxmapmgotchu/);
  assert.match(recovery, /Refusing recovery because target is not loopback/);
  assert.match(recovery, /SCOLAPRO_RECOVERY_SOURCE_ENV/);
  assert.match(recovery, /\.env\.local\.backup-/);
  assert.match(recovery, /source\.from\("schools"\)/);
  assert.match(recovery, /localAdminUserId/);
  assert.match(recovery, /demoLearnerIds/);
  assert.match(gitignore, /^\.env\.local\.backup-\*$/m);
});


test("hosted recovery preserves immutable core identity provenance on reruns", () => {
  assert.match(recovery, /protectedIdentityColumns/);
  assert.match(recovery, /"schools", new Set\(\["id", "tenant_id", "created_at"\]\)/);
  assert.match(recovery, /"learners", new Set\(\["id", "tenant_id", "created_at"\]\)/);
  assert.match(recovery, /"guardian_profiles", new Set\(\["id", "tenant_id", "created_at"\]\)/);
  assert.match(recovery, /existingIds = new Set/);
  assert.match(recovery, /\.insert\(inserts\)/);
  assert.match(recovery, /Object\.fromEntries\(Object\.entries\(row\)\.filter/);
  assert.match(recovery, /\.update\(mutable\)\.eq\("id", row\.id\)/);
});


test("hosted recovery remaps governed provenance actors to Local Admin", () => {
  for (const table of [
    "school_settings",
    "staff_school_assignments",
    "guardian_contacts",
    "guardian_addresses",
    "room_inventory_items",
    "room_inventory_custodians",
    "attendance_register_submissions",
    "attendance_events",
    "school_late_arrival_policies",
    "school_late_arrival_events",
    "detention_sessions",
    "detention_session_supervisors",
    "detention_supervision_preferences",
    "room_inventory_events",
    "room_inventory_verifications",
    "school_payment_settings",
  ]) {
    assert.match(recovery, new RegExp('"' + table + '"'));
  }
  assert.match(recovery, /requiredLocalActorTables\.has\(table\) \? localAdminUserId : null/);
});


test("protected identity lookups use URI-safe recovery batches", () => {
  assert.match(recovery, /const chunkSize = protectedColumns \? 40 : 250/);
  assert.match(recovery, /rows\.slice\(start, start \+ chunkSize\)/);
});


test("hosted recovery reconciles auto-created learner identifiers by natural key", () => {
  assert.match(recovery, /\["school_learner_identifiers", "school_id,learner_id"\]/);
  assert.match(recovery, /if \(table === "school_learner_identifiers"\) delete next\.id/);
});

test("guardian relationships are restored before governed guardian contact provenance", () => {
  const profiles = recovery.indexOf('"guardian_profiles"');
  const relationships = recovery.indexOf('"learner_guardians"');
  const contacts = recovery.indexOf('"guardian_contacts"');
  const addresses = recovery.indexOf('"guardian_addresses"');
  assert.ok(profiles >= 0 && relationships > profiles);
  assert.ok(contacts > relationships);
  assert.ok(addresses > contacts);
});
