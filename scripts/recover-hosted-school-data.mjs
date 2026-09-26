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
  "school_learner_identifiers","guardian_profiles","guardian_contacts","guardian_addresses","learner_guardians",
  "attendance_reasons","room_inventory_items","room_inventory_custodians","school_late_arrival_policies",
  "school_day_overrides","school_payment_settings"
];

const optionalTables = [
  "attendance_register_submissions","attendance_events","school_late_arrival_events","detention_sessions",
  "detention_session_supervisors","detention_supervision_preferences","late_detention_obligations",
  "room_inventory_events","room_inventory_verifications"
];

const primaryKeys = new Map([
  ["school_late_arrival_policies", "school_id"],
  ["school_payment_settings", "school_id"]
]);

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

function rewriteActorIds(table, row) {
  const next = { ...row };
  if (table === "staff_members") {
    if ("user_id" in next) next.user_id = null;
    if ("reconciled_by_user_id" in next) next.reconciled_by_user_id = null;
  }
  const requiredLocalActorTables = new Set([
    "staff_school_assignments","room_inventory_items","room_inventory_custodians",
    "attendance_register_submissions","attendance_events","school_late_arrival_events",
    "detention_sessions","detention_session_supervisors","room_inventory_events",
    "room_inventory_verifications","school_payment_settings"
  ]);
  for (const key of ["created_by_user_id","assigned_by_user_id","recorded_by_user_id","verified_by_user_id","actor_user_id","updated_by_user_id"]) {
    if (!(key in next)) continue;
    next[key] = requiredLocalActorTables.has(table) ? localAdminUserId : null;
  }
  if ("completed_by_user_id" in next && next.completed_by_user_id) next.completed_by_user_id = localAdminUserId;
  return next;
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

async function upsertRows(client, table, rows) {
  if (!rows.length) return;
  const onConflict = primaryKeys.get(table) ?? "id";
  for (let start = 0; start < rows.length; start += 250) {
    const chunk = rows.slice(start, start + 250).map((row) => rewriteActorIds(table, row));
    const result = await client.from(table).upsert(chunk, { onConflict });
    if (result.error) throw new Error("Unable to restore " + table + ": " + result.error.message);
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
  .select("user_id,school_id,role_key")
  .eq("user_id", localAdminUserId)
  .eq("school_id", expectedSchoolId)
  .eq("role_key", "school_admin")
  .maybeSingle();
if (membershipResult.error || !membershipResult.data) {
  throw new Error("Expected Local Admin school membership is missing. Run the local auth seed before recovery.");
}

const sourceSchool = await source.from("schools").select("id,name").eq("id", expectedSchoolId).maybeSingle();
if (sourceSchool.error || !sourceSchool.data) throw new Error("Namib High School was not found in the hosted recovery source.");

console.log("Recovering configured data from " + sourceSchool.data.name + " (" + expectedSourceRef + ") into local Supabase.");
console.log("Hosted source is read-only in this workflow; target is loopback only.");

const sourceCounts = new Map();
for (const table of requiredTables) {
  const rows = await fetchAll(source, table);
  sourceCounts.set(table, rows.length);
  await upsertRows(target, table, rows);
  console.log("restored " + table + ": " + rows.length);
}

for (const table of optionalTables) {
  try {
    const rows = await fetchAll(source, table);
    sourceCounts.set(table, rows.length);
    await upsertRows(target, table, rows);
    console.log("restored " + table + ": " + rows.length);
  } catch (error) {
    console.warn("optional " + table + " skipped: " + (error instanceof Error ? error.message : String(error)));
  }
}

await target.from("enrolments").delete().in("id", demoEnrolmentIds);
await target.from("learners").delete().in("id", demoLearnerIds);

const verifyTables = ["staff_members","learners","enrolments","register_classes","school_rooms","subjects","teacher_allocations","guardian_profiles"];
const verification = [];
for (const table of verifyTables) {
  const hosted = sourceCounts.get(table) ?? await countRows(source, table);
  const local = await countRows(target, table);
  verification.push({ table, hosted, local });
  if (local < hosted) throw new Error("Recovery verification failed for " + table + ": hosted=" + hosted + ", local=" + local + ".");
}
console.table(verification);
console.log("Recovery complete. Restart pnpm dev, sign in as Local Admin, and verify Learners, Staff, Academic setup, Timetable, Class Lists and Room Inventory.");
