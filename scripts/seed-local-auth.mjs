import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userId = "70000000-0000-4000-8000-000000000001";
const membershipId = "70000000-0000-4000-8000-000000000002";
const expectedTenantId = "11111111-1111-4111-8111-111111111111";
const schoolId = "22222222-2222-4222-8222-222222222222";
const email = process.env.SCOLAPRO_LOCAL_ADMIN_EMAIL || "local-admin@scolapro.test";
const password = process.env.SCOLAPRO_LOCAL_ADMIN_PASSWORD;

if (!password || password.length < 12) {
  throw new Error("Set SCOLAPRO_LOCAL_ADMIN_PASSWORD to at least 12 characters before seeding local Auth.");
}

let status;
try {
  status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  throw new Error("Local Supabase is not running. Start it before seeding local Auth.");
}

const apiUrl = new URL(status.API_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname)) {
  throw new Error("Refusing to seed Auth outside the local Supabase stack.");
}
if (!status.SERVICE_ROLE_KEY) throw new Error("Local Supabase did not report a service-role key.");

const supabase = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const existing = await supabase.auth.admin.getUserById(userId);
const authResult = existing.data.user
  ? await supabase.auth.admin.updateUserById(userId, { email, password, email_confirm: true })
  : await supabase.auth.admin.createUser({ id: userId, email, password, email_confirm: true });

if (authResult.error || !authResult.data.user) {
  throw new Error(`Unable to seed local Auth user: ${authResult.error?.message ?? "unknown error"}`);
}

const { data: school, error: schoolError } = await supabase
  .from("schools")
  .select("tenant_id")
  .eq("id", schoolId)
  .single();

if (schoolError || !school) {
  throw new Error(`Unable to resolve local demo school tenant: ${schoolError?.message ?? "school not found"}`);
}
if (school.tenant_id !== expectedTenantId) {
  throw new Error("Local demo school tenant does not match the repository seed.");
}

const [profileResult, membershipResult] = await Promise.all([
  supabase.from("user_profiles").upsert({
    user_id: userId,
    display_name: "Local School Admin",
    preferred_name: "Local Admin",
    must_change_password: false,
  }),
  supabase.from("school_memberships").upsert({
    id: membershipId,
    tenant_id: school.tenant_id,
    school_id: schoolId,
    user_id: userId,
    role_key: "school_admin",
    active_from: "2026-01-01",
    active_to: null,
  }),
]);

if (profileResult.error) throw new Error(`Unable to seed local profile: ${profileResult.error.message}`);
if (membershipResult.error) throw new Error(`Unable to seed local membership: ${membershipResult.error.message}`);

console.log(`Local school-admin account is ready: ${email}`);
