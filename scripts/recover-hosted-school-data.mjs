import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedSourceRef = "jhgumnvhoxmapmgotchu";
const expectedSchoolId = "22222222-2222-4222-8222-222222222222";
const localAdminUserId = "70000000-0000-4000-8000-000000000001";
const demoLearnerIds = ["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002"];
const demoEnrolmentIds = ["60000000-0000-4000-8000-000000000001","60000000-0000-4000-8000-000000000002"];

const requiredTables = [
  "tenants","schools","school_settings","grades","subjects","staff_members","staff_school_assignments",
  "school_rooms","register_classes","subject_offerings","teacher_allocations","learners","enrolments",
  "school_learner_identifiers","guardian_profiles","learner_guardians","guardian_contacts","guardian_addresses",
  "attendance_reasons","room_inventory_items","room_inventory_custodians","school_late_arrival_policies",
  "school_day_overrides","school_payment_settings",
  "sports_houses","sports_age_groups","sports_year_settings",
  "sports_learner_house_assignments","sports_staff_house_assignments"
];

const optionalTables = [
  "attendance_register_submissions","attendance_events","school_late_arrival_events","detention_sessions",
  "detention_session_supervisors","detention_supervision_preferences","late_detention_obligations",
  "room_inventory_events","room_inventory_verifications"
];

const primaryKeys = new Map([
  ["school_late_arrival_policies", "school_id"],
  ["school_payment_settings", "school_id"],
  ["school_learner_identifiers", "school_id,learner_id"]
]);

const protectedIdentityColumns = new Map([
  ["schools", new Set(["id", "tenant_id", "created_at"])],
  ["learners", new Set(["id", "tenant_id", "created_at"])],
  ["guardian_profiles", new Set(["id", "tenant_id", "created_at"])],
  ["sports_houses", new Set(["id", "tenant_id", "school_id", "created_by_user_id", "created_at"])],
  ["sports_age_groups", new Set(["id", "tenant_id", "school_id", "created_by_user_id", "created_at"])],
  ["sports_year_settings", new Set(["id", "tenant_id", "school_id", "academic_year", "created_by_user_id", "created_at"])]
]);

const attendanceReasonIdMap = new Map();
let localAdminStaffMemberId = null;

function parseEnvFile(filePath) {
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

function latestHostedEnvBackup() {
  const explicit = process.env.SCOLAPRO_RECOVERY_SOURCE_ENV;
  if (explicit) return path.resolve(projectRoot, explicit);
  const matches = readdirSync(projectRoot).filter((name) => name.startsWith(".env.local.backup-")).sort().reverse();
  return matches.length ? path.join(projectRoot, matches[0]) : null;
}

function localStatus() {
  try {
    return JSON.parse(execFileSync("supabase", ["status", "-o", "json"], {
      cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }));
  } catch {
    throw new Error("Local Supabase is not running. Start it with supabase start.");
  }
}

function assertSource(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || url.hostname !== expectedSourceRef + ".supabase.co") {
    throw new Error("Recovery source must be the known hosted ScolaPro project " + expectedSourceRef + "; received " + url.origin + ".");
  }
}

function assertLocalTarget(apiUrl) {
  const url = new URL(apiUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Refusing recovery because target is not loopback: " + url.origin);
  }
}

function namibiaDateKey() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Windhoek",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function rewriteActorIds(table, row) {
  const next = { ...row };
  if (table === "attendance_events" && next.reason_id) {
    next.reason_id = attendanceReasonIdMap.get(next.reason_id) ?? next.reason_id;
  }
  if (table === "school_learner_identifiers") delete next.id;
  if (table === "staff_members") {
    if ("user_id" in next) {
      next.user_id = next.id === localAdminStaffMemberId ? localAdminUserId : null;
    }
    if ("reconciled_by_user_id" in next) next.reconciled_by_user_id = null;
  }
  const requiredLocalActorTables = new Set([
    "school_settings","staff_school_assignments","guardian_contacts","guardian_addresses",
    "room_inventory_items","room_inventory_custodians","attendance_register_submissions",
    "attendance_events","school_late_arrival_policies","school_late_arrival_events",
    "detention_sessions","detention_session_supervisors","detention_supervision_preferences",
    "room_inventory_events","room_inventory_verifications","school_payment_settings",
    "sports_houses","sports_age_groups","sports_year_settings",
    "sports_learner_house_assignments","sports_staff_house_assignments"
  ]);
  for (const key of ["created_by_user_id","assigned_by_user_id","recorded_by_user_id","verified_by_user_id","actor_user_id","updated_by_user_id"]) {
    if (!(key in next)) continue;
    next[key] = requiredLocalActorTables.has(table) ? localAdminUserId : null;
  }
  if ("completed_by_user_id" in next && next.completed_by_user_id) next.completed_by_user_id = localAdminUserId;
  return next;
}

async function ensureLocalAdminCurrentRoles(client, seedMembership, sourceMemberships, staffMemberId, recoveryDate) {
  const localResult = await client.from("school_memberships")
    .select("id,role_key,staff_member_id,active_from,active_to")
    .eq("user_id", localAdminUserId)
    .eq("school_id", expectedSchoolId);
  if (localResult.error) {
    throw new Error("Unable to inspect Local Admin memberships during recovery: " + localResult.error.message);
  }

  const localMemberships = localResult.data ?? [];
  const sourceRoles = new Set(sourceMemberships.map((row) => row.role_key));
  const currentLocalMemberships = localMemberships.filter((row) =>
    row.active_from <= recoveryDate &&
    (!row.active_to || row.active_to >= recoveryDate)
  );

  for (const currentLocal of currentLocalMemberships) {
    if (sourceRoles.has(currentLocal.role_key)) continue;
    const deleteResult = await client.from("school_memberships")
      .delete()
      .eq("id", currentLocal.id);
    if (deleteResult.error) {
      throw new Error(
        "Unable to remove stale Local Admin " +
        currentLocal.role_key +
        " membership: " +
        deleteResult.error.message,
      );
    }
  }

  for (const sourceMembership of sourceMemberships) {
    const sameRoleLocals = currentLocalMemberships.filter(
      (row) => row.role_key === sourceMembership.role_key,
    );
    const currentLocal =
      sameRoleLocals.find((row) => row.active_from === sourceMembership.active_from) ??
      sameRoleLocals[0] ??
      null;

    for (const duplicateLocal of sameRoleLocals) {
      if (duplicateLocal.id === currentLocal?.id) continue;
      const deleteDuplicateResult = await client.from("school_memberships")
        .delete()
        .eq("id", duplicateLocal.id);
      if (deleteDuplicateResult.error) {
        throw new Error(
          "Unable to remove duplicate Local Admin " +
          sourceMembership.role_key +
          " membership: " +
          deleteDuplicateResult.error.message,
        );
      }
    }

    if (currentLocal) {
      const desiredActiveTo = sourceMembership.active_to ?? null;
      if (
        currentLocal.staff_member_id !== staffMemberId ||
        currentLocal.active_from !== sourceMembership.active_from ||
        (currentLocal.active_to ?? null) !== desiredActiveTo
      ) {
        const updateResult = await client.from("school_memberships")
          .update({
            staff_member_id: staffMemberId,
            active_from: sourceMembership.active_from,
            active_to: desiredActiveTo,
          })
          .eq("id", currentLocal.id);
        if (updateResult.error) {
          throw new Error(
            "Unable to synchronize Local Admin " +
            sourceMembership.role_key +
            " membership: " +
            updateResult.error.message,
          );
        }
      }
      continue;
    }

    const insertResult = await client.from("school_memberships").insert({
      tenant_id: seedMembership.tenant_id,
      school_id: expectedSchoolId,
      user_id: localAdminUserId,
      staff_member_id: staffMemberId,
      role_key: sourceMembership.role_key,
      active_from: sourceMembership.active_from,
      active_to: sourceMembership.active_to ?? null,
    });
    if (insertResult.error) {
      throw new Error("Unable to mirror Local Admin " + sourceMembership.role_key + " membership: " + insertResult.error.message);
    }
  }
}

async function fetchAll(client, table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const result = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (result.error) throw new Error("Unable to read hosted " + table + ": " + result.error.message);
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < pageSize) break;
  }
  return rows;
}

async function restoreAttendanceReasons(client, rows) {
  if (!rows.length) return;

  const existingResult = await client.from("attendance_reasons")
    .select("id,reason_code");
  if (existingResult.error) {
    throw new Error("Unable to inspect existing attendance_reasons: " + existingResult.error.message);
  }

  const localByCode = new Map((existingResult.data ?? []).map((row) => [row.reason_code, row.id]));

  for (const sourceRow of rows) {
    const localId = localByCode.get(sourceRow.reason_code);
    const payload = { ...sourceRow };
    delete payload.id;

    if (localId) {
      const updateResult = await client.from("attendance_reasons")
        .update(payload)
        .eq("id", localId);
      if (updateResult.error) {
        throw new Error("Unable to update attendance_reasons: " + updateResult.error.message);
      }
      attendanceReasonIdMap.set(sourceRow.id, localId);
      continue;
    }

    const insertResult = await client.from("attendance_reasons")
      .insert(payload)
      .select("id")
      .single();
    if (insertResult.error || !insertResult.data) {
      throw new Error("Unable to insert attendance_reasons: " + (insertResult.error?.message ?? "missing inserted id"));
    }
    localByCode.set(sourceRow.reason_code, insertResult.data.id);
    attendanceReasonIdMap.set(sourceRow.id, insertResult.data.id);
  }
}

async function upsertRows(client, table, rows) {
  if (!rows.length) return;
  const onConflict = primaryKeys.get(table) ?? "id";
  const protectedColumns = protectedIdentityColumns.get(table);
  const chunkSize = protectedColumns ? 40 : 250;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize).map((row) => rewriteActorIds(table, row));

    if (!protectedColumns || onConflict !== "id") {
      const result = await client.from(table).upsert(chunk, { onConflict });
      if (result.error) throw new Error("Unable to restore " + table + ": " + result.error.message);
      continue;
    }

    const ids = chunk.map((row) => row.id).filter(Boolean);
    const existingResult = await client.from(table).select("id").in("id", ids);
    if (existingResult.error) throw new Error("Unable to inspect existing " + table + ": " + existingResult.error.message);
    const existingIds = new Set((existingResult.data ?? []).map((row) => row.id));

    const inserts = chunk.filter((row) => !existingIds.has(row.id));
    if (inserts.length) {
      const insertResult = await client.from(table).insert(inserts);
      if (insertResult.error) throw new Error("Unable to insert " + table + ": " + insertResult.error.message);
    }

    for (const row of chunk.filter((item) => existingIds.has(item.id))) {
      const mutable = Object.fromEntries(Object.entries(row).filter(([key]) => !protectedColumns.has(key)));
      const updateResult = await client.from(table).update(mutable).eq("id", row.id);
      if (updateResult.error) throw new Error("Unable to update existing " + table + ": " + updateResult.error.message);
    }
  }
}

async function restoreLateDetentionObligations(client, rows) {
  if (!rows.length) return;

  for (const sourceRow of rows) {
    const existingResult = await client.from("late_detention_obligations")
      .select("id,status")
      .eq("id", sourceRow.id)
      .maybeSingle();
    if (existingResult.error) {
      throw new Error("Unable to inspect late_detention_obligations: " + existingResult.error.message);
    }

    const terminal = sourceRow.status === "completed" || sourceRow.status === "waived";
    const existing = existingResult.data;

    if (existing?.status === "completed" || existing?.status === "waived") {
      if (existing.status !== sourceRow.status) {
        throw new Error(
          "Local late_detention_obligations terminal state differs from hosted for " + sourceRow.id +
          ": hosted=" + sourceRow.status + ", local=" + existing.status + ".",
        );
      }
      continue;
    }

    if (!terminal) {
      await upsertRows(client, "late_detention_obligations", [sourceRow]);
      continue;
    }

    if (!existing) {
      const pendingPayload = rewriteActorIds("late_detention_obligations", sourceRow);
      pendingPayload.status = "pending";
      pendingPayload.completed_at = null;
      pendingPayload.completed_by_user_id = null;
      pendingPayload.resolution_note = null;
      const insertResult = await client.from("late_detention_obligations").insert(pendingPayload);
      if (insertResult.error) {
        throw new Error("Unable to insert pending late_detention_obligations recovery row: " + insertResult.error.message);
      }
    }

    const resolvedAt = sourceRow.status === "completed"
      ? (sourceRow.completed_at ?? sourceRow.updated_at ?? sourceRow.created_at)
      : null;
    const resolveResult = await client.from("late_detention_obligations")
      .update({
        status: sourceRow.status,
        completed_at: resolvedAt,
        completed_by_user_id: localAdminUserId,
        resolution_note: sourceRow.resolution_note ?? null,
        updated_at: sourceRow.updated_at ?? resolvedAt ?? sourceRow.created_at,
      })
      .eq("id", sourceRow.id);
    if (resolveResult.error) {
      throw new Error("Unable to resolve late_detention_obligations recovery row: " + resolveResult.error.message);
    }
  }
}

async function deleteDemoRows(client) {
  const demoBatchItems = await client.from("report_card_batch_items")
    .delete()
    .in("enrolment_id", demoEnrolmentIds);
  if (demoBatchItems.error) {
    throw new Error("Unable to remove demo report-card batch items: " + demoBatchItems.error.message);
  }

  const demoSnapshotsResult = await client.from("report_card_snapshots")
    .select("id")
    .in("enrolment_id", demoEnrolmentIds);
  if (demoSnapshotsResult.error) {
    throw new Error("Unable to inspect demo report-card snapshots: " + demoSnapshotsResult.error.message);
  }
  const demoSnapshotIds = (demoSnapshotsResult.data ?? []).map((row) => row.id);

  if (demoSnapshotIds.length) {
    const renderJobs = await client.from("report_card_render_jobs")
      .delete()
      .in("snapshot_id", demoSnapshotIds);
    if (renderJobs.error) {
      throw new Error("Unable to remove demo report-card render jobs: " + renderJobs.error.message);
    }

    const documents = await client.from("report_card_documents")
      .delete()
      .in("snapshot_id", demoSnapshotIds);
    if (documents.error) {
      throw new Error("Unable to remove demo report-card documents: " + documents.error.message);
    }

    const snapshots = await client.from("report_card_snapshots")
      .delete()
      .in("id", demoSnapshotIds);
    if (snapshots.error) {
      throw new Error("Unable to remove demo report-card snapshots: " + snapshots.error.message);
    }
  }

  const identifiers = await client.from("school_learner_identifiers")
    .delete()
    .eq("school_id", expectedSchoolId)
    .in("learner_id", demoLearnerIds);
  if (identifiers.error) {
    throw new Error("Unable to remove demo school learner identifiers: " + identifiers.error.message);
  }

  const enrolments = await client.from("enrolments").delete().in("id", demoEnrolmentIds);
  if (enrolments.error) {
    throw new Error("Unable to remove demo enrolments: " + enrolments.error.message);
  }

  const learners = await client.from("learners").delete().in("id", demoLearnerIds);
  if (learners.error) {
    throw new Error("Unable to remove demo learners: " + learners.error.message);
  }
}

async function countRows(client, table) {
  const result = await client.from(table).select("*", { count: "exact", head: true });
  if (result.error) throw new Error("Unable to count " + table + ": " + result.error.message);
  return result.count ?? 0;
}

const sourceEnvPath = latestHostedEnvBackup();
if (!sourceEnvPath || !existsSync(sourceEnvPath)) {
  throw new Error("Hosted credential backup not found. Set SCOLAPRO_RECOVERY_SOURCE_ENV to the saved hosted .env file.");
}

const sourceEnv = parseEnvFile(sourceEnvPath);
const sourceUrl = sourceEnv.NEXT_PUBLIC_SUPABASE_URL;
const sourceServiceKey = sourceEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!sourceUrl || !sourceServiceKey) {
  throw new Error("Hosted source env " + path.basename(sourceEnvPath) + " is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}
assertSource(sourceUrl);

const status = localStatus();
assertLocalTarget(status.API_URL);
if (!status.SERVICE_ROLE_KEY) throw new Error("Local Supabase did not report a service-role key.");

const source = createClient(sourceUrl, sourceServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const target = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const membershipResult = await target.from("school_memberships")
  .select("id,tenant_id,user_id,school_id,role_key,staff_member_id")
  .eq("user_id", localAdminUserId)
  .eq("school_id", expectedSchoolId)
  .eq("role_key", "school_admin")
  .maybeSingle();
if (membershipResult.error || !membershipResult.data) {
  throw new Error("Expected Local Admin school membership is missing. Run the local auth seed before recovery.");
}

const recoveryDate = namibiaDateKey();
const sourceAdminMembershipsResult = await source.from("school_memberships")
  .select("user_id,staff_member_id,role_key,active_from,active_to")
  .eq("school_id", expectedSchoolId)
  .eq("role_key", "school_admin")
  .not("staff_member_id", "is", null);
if (sourceAdminMembershipsResult.error) {
  throw new Error("Unable to resolve hosted school-admin staff identity: " + sourceAdminMembershipsResult.error.message);
}
const currentSourceAdmins = (sourceAdminMembershipsResult.data ?? []).filter((row) =>
  row.user_id &&
  row.staff_member_id &&
  row.active_from <= recoveryDate &&
  (!row.active_to || row.active_to >= recoveryDate)
);
const currentSourceAdminIdentities = [...new Map(
  currentSourceAdmins.map((row) => [row.user_id + ":" + row.staff_member_id, row]),
).values()];
if (currentSourceAdminIdentities.length !== 1) {
  throw new Error(
    "Expected exactly one current hosted school-admin staff identity for recovery; found " +
    currentSourceAdminIdentities.length + ".",
  );
}
const hostedAdminUserId = currentSourceAdminIdentities[0].user_id;
const hostedAdminStaffMemberId = currentSourceAdminIdentities[0].staff_member_id;
if (
  membershipResult.data.staff_member_id &&
  membershipResult.data.staff_member_id !== hostedAdminStaffMemberId
) {
  throw new Error("Local Admin staff identity differs from the current hosted school-admin identity.");
}
localAdminStaffMemberId = membershipResult.data.staff_member_id ?? hostedAdminStaffMemberId;

const sourceRoleMembershipsResult = await source.from("school_memberships")
  .select("role_key,active_from,active_to")
  .eq("school_id", expectedSchoolId)
  .eq("user_id", hostedAdminUserId)
  .eq("staff_member_id", hostedAdminStaffMemberId);
if (sourceRoleMembershipsResult.error) {
  throw new Error("Unable to resolve hosted current role set: " + sourceRoleMembershipsResult.error.message);
}
const currentSourceRoleMemberships = [...new Map(
  (sourceRoleMembershipsResult.data ?? [])
    .filter((row) =>
      row.active_from <= recoveryDate &&
      (!row.active_to || row.active_to >= recoveryDate)
    )
    .sort((left, right) => right.active_from.localeCompare(left.active_from))
    .map((row) => [row.role_key, row]),
).values()];
if (!currentSourceRoleMemberships.some((row) => row.role_key === "school_admin")) {
  throw new Error("Hosted recovery identity does not have a current school_admin membership.");
}

const sourceSchool = await source.from("schools").select("id,name").eq("id", expectedSchoolId).maybeSingle();
if (sourceSchool.error || !sourceSchool.data) throw new Error("Namib High School was not found in the hosted recovery source.");

console.log("Recovering configured data from " + sourceSchool.data.name + " (" + expectedSourceRef + ") into local Supabase.");
console.log("Hosted source is read-only in this workflow; target is loopback only.");

const sourceCounts = new Map();
for (const table of requiredTables) {
  const rows = await fetchAll(source, table);
  sourceCounts.set(table, rows.length);
  if (table === "attendance_reasons") {
    await restoreAttendanceReasons(target, rows);
  } else {
    await upsertRows(target, table, rows);
  }
  if (table === "staff_members") {
    await ensureLocalAdminCurrentRoles(
      target,
      membershipResult.data,
      currentSourceRoleMemberships,
      localAdminStaffMemberId,
      recoveryDate,
    );
  }
  console.log("restored " + table + ": " + rows.length);
}

for (const table of optionalTables) {
  try {
    const rows = await fetchAll(source, table);
    sourceCounts.set(table, rows.length);
    if (table === "late_detention_obligations") {
      await restoreLateDetentionObligations(target, rows);
    } else {
      await upsertRows(target, table, rows);
    }
    console.log("restored " + table + ": " + rows.length);
  } catch (error) {
    console.warn("optional " + table + " skipped: " + (error instanceof Error ? error.message : String(error)));
  }
}

await deleteDemoRows(target);

const localAdminStaffResult = await target.from("staff_members")
  .select("id,user_id")
  .eq("id", localAdminStaffMemberId)
  .maybeSingle();
if (
  localAdminStaffResult.error ||
  !localAdminStaffResult.data ||
  localAdminStaffResult.data.user_id !== localAdminUserId
) {
  throw new Error("Recovery verification failed: Local Admin staff identity mapping was not preserved.");
}

const localAdminRolesResult = await target.from("school_memberships")
  .select("role_key,staff_member_id,active_from,active_to")
  .eq("user_id", localAdminUserId)
  .eq("school_id", expectedSchoolId);
if (localAdminRolesResult.error) {
  throw new Error("Unable to verify Local Admin current roles after recovery: " + localAdminRolesResult.error.message);
}
const localCurrentRoles = new Map(
  (localAdminRolesResult.data ?? [])
    .filter((row) =>
      row.active_from <= recoveryDate &&
      (!row.active_to || row.active_to >= recoveryDate)
    )
    .map((row) => [row.role_key, row]),
);
for (const sourceMembership of currentSourceRoleMemberships) {
  const localMembership = localCurrentRoles.get(sourceMembership.role_key);
  if (!localMembership || localMembership.staff_member_id !== localAdminStaffMemberId) {
    throw new Error(
      "Recovery verification failed: Local Admin current " +
      sourceMembership.role_key +
      " membership was not mirrored.",
    );
  }
}

const verifyTables = [
  "staff_members","learners","enrolments","register_classes","school_rooms","subjects","teacher_allocations","guardian_profiles",
  "sports_houses","sports_age_groups","sports_year_settings","sports_learner_house_assignments","sports_staff_house_assignments",
];
const verification = [];
for (const table of verifyTables) {
  const hosted = sourceCounts.get(table) ?? await countRows(source, table);
  const local = await countRows(target, table);
  verification.push({ table, hosted, local });
  const requiresExactMatch = [
    "learners",
    "enrolments",
    "sports_houses",
    "sports_age_groups",
    "sports_year_settings",
    "sports_learner_house_assignments",
    "sports_staff_house_assignments",
  ].includes(table);
  if ((requiresExactMatch && local !== hosted) || (!requiresExactMatch && local < hosted)) {
    throw new Error("Recovery verification failed for " + table + ": hosted=" + hosted + ", local=" + local + ".");
  }
}
console.table(verification);
console.log("Recovery complete. Restart pnpm dev, sign in as Local Admin, and verify Learners, Staff, Academic setup, Timetable, Class Lists, Room Inventory and Sports / Houses.");
