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
  assert.equal(packageJson.scripts["local:sync-db"], "supabase migration up --local --include-all");
  assert.match(dev, /execFileSync\("supabase", \["migration", "up", "--local", "--include-all"\]/);
  assert.match(dev, /Local Supabase migrations are not current/);
  assert.match(dev, /pnpm local:sync-db/);
});

test("local Auth provisioning is password-gated, loopback-only and auto-seeded by local dev when configured", () => {
  assert.match(seed, /SCOLAPRO_LOCAL_ADMIN_PASSWORD/);
  assert.match(dev, /SCOLAPRO_LOCAL_ADMIN_PASSWORD/);
  assert.match(dev, /SCOLAPRO_LOCAL_ADMIN_EMAIL/);
  assert.match(dev, /seedLocalAuthIfConfigured/);
  assert.match(dev, /seed-local-auth\.mjs/);
  assert.match(dev, /Local Auth seed skipped/);
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


test("hosted recovery establishes staff identity and current roles after hosted staff import", () => {
  assert.match(recovery, /let localAdminStaffMemberId = null/);
  assert.match(recovery, /function namibiaDateKey\(\)/);
  assert.match(recovery, /select\("id,tenant_id,user_id,school_id,role_key,staff_member_id,active_from,active_to"\)/);
  assert.match(recovery, /source\.from\("school_memberships"\)/);
  assert.match(recovery, /currentSourceAdminIdentities\.length !== 1/);
  assert.match(recovery, /seedMembership\.staff_member_id \?\? hostedAdminStaffMemberId/);
  assert.match(recovery, /const currentSourceRoleMemberships/);
  assert.match(recovery, /async function ensureLocalAdminCurrentRoles/);
  assert.match(recovery, /const recoveryDate = namibiaDateKey\(\)/);
  assert.match(recovery, /const currentLocalAdminMemberships = \(membershipResult\.data \?\? \[\]\)/);
  assert.match(recovery, /const seedMembership = currentLocalAdminMemberships\[0\] \?\? null/);
  assert.doesNotMatch(recovery, /\.eq\("role_key", "school_admin"\)\s*\.maybeSingle\(\)/);
  assert.match(recovery, /if \(table === "staff_members"\)/);
  assert.match(recovery, /ensureLocalAdminCurrentRoles\(/);
  assert.match(recovery, /const sourceRoles = new Set/);
  assert.match(recovery, /const currentLocalMemberships = localMemberships\.filter/);
  assert.match(recovery, /sourceRoles\.has\(currentLocal\.role_key\)/);
  assert.match(recovery, /\.delete\(\)\s*\.eq\("id", currentLocal\.id\)/);
  assert.match(recovery, /Unable to remove stale Local Admin/);
  assert.match(recovery, /const sameRoleLocals = localMemberships\.filter/);
  assert.match(recovery, /const exactLocal =/);
  assert.match(recovery, /row\.active_from === sourceMembership\.active_from/);
  assert.match(recovery, /const currentSameRoleLocals = sameRoleLocals\.filter/);
  assert.match(recovery, /const currentLocal = exactLocal \?\? currentSameRoleLocals\[0\] \?\? null/);
  assert.match(recovery, /for \(const duplicateLocal of currentSameRoleLocals\)/);
  assert.match(recovery, /Unable to remove duplicate Local Admin/);
  assert.match(recovery, /staff_member_id: staffMemberId/);
  assert.match(recovery, /active_from: sourceMembership\.active_from/);
  assert.match(recovery, /active_to: desiredActiveTo/);
  assert.match(recovery, /Unable to synchronize Local Admin/);
  assert.match(recovery, /role_key: sourceMembership\.role_key/);
  assert.match(
    recovery,
    /next\.user_id = next\.id === localAdminStaffMemberId \? localAdminUserId : null/,
  );
  const restoreLoop = recovery.indexOf("for (const table of requiredTables)");
  const staffRoleSync = recovery.indexOf('if (table === "staff_members")', restoreLoop);
  const preflight = recovery.indexOf("const sourceSchool =", 0);
  assert.ok(restoreLoop > preflight, "required-table restore loop must follow preflight");
  assert.ok(staffRoleSync > restoreLoop, "staff identity linking must happen only after staff_members restore");
  assert.match(recovery, /localAdminStaffResult\.data\.user_id !== localAdminUserId/);
  assert.match(recovery, /Recovery verification failed: Local Admin current/);
  assert.match(recovery, /sourceMembership\.role_key/);
  assert.match(recovery, /membership was not mirrored\./);
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
    "sports_houses",
    "sports_age_groups",
    "sports_year_settings",
    "sports_learner_house_assignments",
    "sports_staff_house_assignments",
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


test("hosted recovery reconciles seeded attendance reasons and remaps event foreign keys", () => {
  assert.match(recovery, /const attendanceReasonIdMap = new Map\(\)/);
  assert.match(recovery, /restoreAttendanceReasons/);
  assert.match(recovery, /select\("id,reason_code"\)/);
  assert.match(recovery, /delete payload\.id/);
  assert.match(recovery, /attendanceReasonIdMap\.set\(sourceRow\.id, localId\)/);
  assert.match(recovery, /table === "attendance_events" && next\.reason_id/);
  assert.match(recovery, /attendanceReasonIdMap\.get\(next\.reason_id\) \?\? next\.reason_id/);
});


test("hosted recovery restores terminal detention history through valid lifecycle transitions", () => {
  assert.match(recovery, /restoreLateDetentionObligations/);
  assert.match(recovery, /terminal = sourceRow\.status === "completed" \|\| sourceRow\.status === "waived"/);
  assert.match(recovery, /pendingPayload\.status = "pending"/);
  assert.match(recovery, /completed_by_user_id: localAdminUserId/);
  assert.match(recovery, /status: sourceRow\.status/);
  assert.match(recovery, /Local late_detention_obligations terminal state differs from hosted/);
});

test("hosted recovery removes synthetic learners in dependency order and verifies exact counts", () => {
  const identifiers = recovery.indexOf('from("school_learner_identifiers")');
  const enrolments = recovery.indexOf('from("enrolments").delete().in("id", demoEnrolmentIds)');
  const learners = recovery.indexOf('from("learners").delete().in("id", demoLearnerIds)');
  assert.ok(identifiers >= 0 && enrolments > identifiers && learners > enrolments);
  assert.match(recovery, /Unable to remove demo school learner identifiers/);
  assert.match(recovery, /Unable to remove demo enrolments/);
  assert.match(recovery, /Unable to remove demo learners/);
  assert.match(recovery, /const requiresExactMatch = \[/);
  assert.match(recovery, /"sports_houses"/);
  assert.match(recovery, /"sports_learner_house_assignments"/);
  assert.match(recovery, /"sports_staff_house_assignments"/);
  assert.match(recovery, /local !== hosted/);
});


test("demo cleanup removes local report-card dependents before synthetic enrolments", () => {
  const batchItems = recovery.indexOf('from("report_card_batch_items")');
  const snapshots = recovery.indexOf('from("report_card_snapshots")');
  const renderJobs = recovery.indexOf('from("report_card_render_jobs")');
  const documents = recovery.indexOf('from("report_card_documents")');
  const identifiers = recovery.indexOf('from("school_learner_identifiers")');
  const enrolments = recovery.indexOf('from("enrolments").delete().in("id", demoEnrolmentIds)');
  assert.ok(batchItems >= 0);
  assert.ok(snapshots > batchItems);
  assert.ok(renderJobs > snapshots);
  assert.ok(documents > renderJobs);
  assert.ok(identifiers > documents);
  assert.ok(enrolments > identifiers);
  assert.match(recovery, /Unable to remove demo report-card batch items/);
  assert.match(recovery, /Unable to remove demo report-card render jobs/);
  assert.match(recovery, /Unable to remove demo report-card documents/);
  assert.match(recovery, /Unable to remove demo report-card snapshots/);
});

test("hosted recovery restores Sports/Houses after learner and staff identities", () => {
  const staff = recovery.indexOf('"staff_members"');
  const learners = recovery.indexOf('"learners"');
  const houses = recovery.indexOf('"sports_houses"');
  const ageGroups = recovery.indexOf('"sports_age_groups"');
  const yearSettings = recovery.indexOf('"sports_year_settings"');
  const learnerAssignments = recovery.indexOf('"sports_learner_house_assignments"');
  const staffAssignments = recovery.indexOf('"sports_staff_house_assignments"');
  assert.ok(houses > staff && houses > learners);
  assert.ok(ageGroups > houses);
  assert.ok(yearSettings > ageGroups);
  assert.ok(learnerAssignments > yearSettings);
  assert.ok(staffAssignments > learnerAssignments);
  for (const table of [
    "sports_houses",
    "sports_age_groups",
    "sports_year_settings",
    "sports_learner_house_assignments",
    "sports_staff_house_assignments",
  ]) {
    assert.match(recovery, new RegExp('"' + table + '"'));
  }
});

test("all restored Sports/Houses tables are exact-gated after recovery", () => {
  const verifyStart = recovery.indexOf("const verifyTables = [");
  const verifyEnd = recovery.indexOf("];", verifyStart);
  const exactStart = recovery.indexOf("const requiresExactMatch = [", verifyEnd);
  const exactEnd = recovery.indexOf("].includes(table);", exactStart);
  assert.ok(verifyStart >= 0 && verifyEnd > verifyStart, "verifyTables block must exist");
  assert.ok(exactStart > verifyEnd && exactEnd > exactStart, "exact-match block must exist");
  const verifyBlock = recovery.slice(verifyStart, verifyEnd);
  const exactBlock = recovery.slice(exactStart, exactEnd);
  for (const table of [
    "sports_houses",
    "sports_age_groups",
    "sports_year_settings",
    "sports_learner_house_assignments",
    "sports_staff_house_assignments",
  ]) {
    assert.match(verifyBlock, new RegExp('"' + table + '"'), table + " must be verified");
    assert.match(exactBlock, new RegExp('"' + table + '"'), table + " must require exact parity");
  }
});

test("Sports/Houses configuration reruns preserve immutable scope and creator columns", () => {
  for (const table of ["sports_houses", "sports_age_groups", "sports_year_settings"]) {
    assert.match(
      recovery,
      new RegExp('\\["' + table + '", new Set\\(\\['),
      table + " must use protected identity updates",
    );
  }
  assert.match(
    recovery,
    /"sports_houses", new Set\(\["id", "tenant_id", "school_id", "created_by_user_id", "created_at"\]\)/,
  );
  assert.match(
    recovery,
    /"sports_age_groups", new Set\(\["id", "tenant_id", "school_id", "created_by_user_id", "created_at"\]\)/,
  );
  assert.match(
    recovery,
    /"sports_year_settings", new Set\(\["id", "tenant_id", "school_id", "academic_year", "created_by_user_id", "created_at"\]\)/,
  );
});

test("role reconciliation reuses an exact historical start-date row before updating a newer current row", () => {
  const sameRoleLocals = recovery.indexOf("const sameRoleLocals = localMemberships.filter");
  const exactLocal = recovery.indexOf("const exactLocal =", sameRoleLocals);
  const currentSameRoleLocals = recovery.indexOf("const currentSameRoleLocals =", exactLocal);
  const keeper = recovery.indexOf("const currentLocal = exactLocal ?? currentSameRoleLocals[0] ?? null", currentSameRoleLocals);
  const duplicateCleanup = recovery.indexOf("for (const duplicateLocal of currentSameRoleLocals)", keeper);
  const synchronize = recovery.indexOf(".update({", duplicateCleanup);
  assert.ok(sameRoleLocals >= 0);
  assert.ok(exactLocal > sameRoleLocals);
  assert.ok(currentSameRoleLocals > exactLocal);
  assert.ok(keeper > currentSameRoleLocals);
  assert.ok(duplicateCleanup > keeper);
  assert.ok(synchronize > duplicateCleanup);
});

test("school-admin preflight tolerates historical rows and selects a current seed membership", () => {
  const recoveryDate = recovery.indexOf("const recoveryDate = namibiaDateKey()");
  const query = recovery.indexOf('.eq("role_key", "school_admin")', recoveryDate);
  const currentRows = recovery.indexOf("const currentLocalAdminMemberships =", query);
  const seed = recovery.indexOf("const seedMembership = currentLocalAdminMemberships[0] ?? null", currentRows);
  const hostedAdminLookup = recovery.indexOf('const sourceAdminMembershipsResult = await source.from("school_memberships")', seed);
  assert.ok(recoveryDate >= 0);
  assert.ok(query > recoveryDate);
  assert.ok(currentRows > query);
  assert.ok(seed > currentRows);
  assert.ok(hostedAdminLookup > seed);
});
