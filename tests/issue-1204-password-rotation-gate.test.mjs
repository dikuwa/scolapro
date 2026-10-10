import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const proxy = read("src/lib/supabase/proxy.ts");
const route = read("src/app/password-rotation/page.tsx");
const form = read("src/features/auth/password-rotation-form.tsx");
const actions = read("src/features/profile/server/actions.ts");
const login = read("src/features/auth/actions.ts");

test("flagged user is redirected before entering ordinary app pages", () => {
  assert.match(proxy, /pathname !== "\/password-rotation"/);
  assert.match(proxy, /\.select\("must_change_password"\)/);
  assert.match(proxy, /profileError \|\| !profile \|\| profile\.must_change_password !== false/);
  assert.match(proxy, /rotationUrl\.pathname = "\/password-rotation"/);
});
test("rotation has a dedicated authenticated page without an app shell", () => {
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /if \(!user\) redirect\("\/login"\)/);
  assert.match(route, /if \(profile\?\.must_change_password === false\) redirect\("\/"\)/);
  assert.doesNotMatch(route, /AppShell/);
  assert.match(form, /changePassword/);
  assert.match(form, /signOut/);
  assert.match(form, /autocomplete/i);
});
test("password action does not report success when profile clearance fails", () => {
  assert.match(actions, /if \(profileError\)/);
  assert.match(actions, /account clearance could not be saved/);
  assert.match(actions, /supabase\.auth\.updateUser\(\{ password \}\)/);
});

test("sign-in redirects flagged or unresolved profiles to rotation before any deep link", () => {
  assert.match(login, /if \(profileError \|\| !profile \|\| profile\.must_change_password !== false\)/);
  assert.match(login, /redirect\("\/password-rotation"\)/);
});

test("server-side role context rejects users who must rotate passwords", () => {
  const context = read("src/lib/auth/get-user-context.ts");
  assert.match(context, /rpcRow\.profile\.must_change_password !== false/);
  assert.match(context, /Password rotation required before accessing school authority/);
});

test("invitation acceptance cannot grant roles before forced password rotation", () => {
  const invitations = read("src/features/auth/invitation-actions.ts");
  const action = invitations.slice(invitations.indexOf("export async function acceptInvitation("));
  assert.match(action, /rotationProfile\.must_change_password !== false/);
  assert.match(action, /redirect\("\/password-rotation"\)/);
  assert.ok(action.indexOf("rotationProfile.must_change_password") < action.indexOf('supabase.rpc("accept_school_invitation"'));
});

test("automatic signup cannot accept invitation before account security check", () => {
  const invitations = read("src/features/auth/invitation-actions.ts");
  const signup = invitations.slice(invitations.indexOf("export async function signUpForInvitation("), invitations.indexOf("export async function acceptInvitation("));
  assert.match(signup, /signupProfileError \|\| !signupProfile \|\| signupProfile\.must_change_password !== false/);
  assert.ok(signup.indexOf("signupProfile.must_change_password") < signup.indexOf('supabase.rpc("accept_school_invitation"'));
});

test("security redirects preserve refreshed Supabase session cookies", () => {
  assert.match(proxy, /function redirectWithSession\(target: URL\)/);
  assert.match(proxy, /response\.cookies\.getAll\(\)\.forEach/);
  assert.match(proxy, /redirectResponse\.cookies\.set\(name, value, options\)/);
  assert.match(proxy, /return redirectWithSession\(rotationUrl\)/);
});

test("offline attendance API fails closed when auth context cannot resolve", () => {
  const route = read("src/app/api/offline/attendance/route.ts");
  assert.match(route, /try \{\s*context = await getUserContext\(\)/);
  assert.match(route, /status: 403/);
  assert.ok(route.indexOf("context = await getUserContext()") < route.indexOf("await submitDailyRegister("));
});

test("navigation attention API guards password-rotation-pending accounts", () => {
  const route = read("src/app/api/navigation-attention/route.ts");
  assert.match(route, /\.select\("must_change_password"\)/);
  assert.match(route, /profileError \|\| !profile \|\| profile\.must_change_password !== false/);
  assert.match(route, /status: 403/);
  assert.ok(route.indexOf('select("must_change_password")') < route.indexOf("await getNavigationAttentionCounts()"));
  assert.doesNotMatch(route, /getUserContext\(\)/);
});

test("avatar API rejects writes until mandatory rotation completes", () => {
  const route = read("src/app/api/profile/avatar/route.ts");
  assert.match(route, /securityProfile\.must_change_password !== false/);
  assert.match(route, /status: 403/);
  assert.ok(route.indexOf("securityProfile.must_change_password") < route.indexOf("await request.formData()"));
});

test("signed avatar upload action checks password rotation before creating token", () => {
  const action = read("src/features/profile/server/avatar-upload.ts");
  assert.match(action, /securityProfile\.must_change_password !== false/);
  assert.ok(action.indexOf("securityProfile.must_change_password") < action.indexOf("createSignedUploadUrl(path)"));
});

test("avatar save and deletion actions fail closed before storage operations", () => {
  const actions = read("src/features/profile/server/actions.ts");
  for (const name of ["saveUploadedAvatar", "deleteAvatar"]) {
    const section = actions.slice(actions.indexOf(`export async function ${name}(`));
    assert.match(section, /securityProfile\.must_change_password !== false/);
    assert.ok(section.indexOf("securityProfile.must_change_password") < section.indexOf('admin.storage.from("avatars")') || name === "deleteAvatar");
  }
});

test("password rotation clearance cannot be forged by authenticated profile updates", () => {
  const migration = read("supabase/migrations/20261009154000_password_rotation_clearance_guard.sql");
  const actions = read("src/features/profile/server/actions.ts");
  assert.match(migration, /before update of must_change_password on public\.user_profiles/i);
  assert.match(migration, /auth\.role\(\).*service_role/);
  assert.match(actions, /await createSupabaseAdminClient\(\)\.from\("user_profiles"\)/);
  assert.ok(actions.indexOf("await supabase.auth.updateUser({ password })") < actions.indexOf("await createSupabaseAdminClient().from(\"user_profiles\")"));
});

test("all offline sync endpoints return JSON 403 when the rotation gate blocks authority", () => {
  for (const path of [
    "src/app/api/offline/assessment/marks/route.ts",
    "src/app/api/offline/attendance/subject-period/route.ts",
    "src/app/api/offline/library/route.ts",
    "src/app/api/offline/lesson-preparation/route.ts",
    "src/app/api/offline/teaching/coverage/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /try\s*\{\s*context = await getUserContext\(\);/);
    assert.match(route, /catch\s*\{\s*return NextResponse\.json\(/);
    assert.match(route, /status: 403/);
  }
});

test("register teacher document API rejects unresolved authority with JSON 403", () => {
  const route = read("src/app/api/attendance/register-teacher/route.ts");
  assert.match(route, /try\s*\{\s*context = await getUserContext\(\);/);
  assert.match(route, /catch\s*\{\s*return Response\.json\(/);
  assert.match(route, /status: 403/);
});

test("official attendance, room and sports exports deny unresolved rotation authority", () => {
  for (const path of [
    "src/app/api/official-documents/attendance-summary/route.ts",
    "src/app/api/official-documents/room-inventory/route.ts",
    "src/app/api/official-documents/sports-house-roster/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /try\s*\{\s*context = await getUserContext\(\);/);
    assert.match(route, /catch\s*\{\s*return Response\.json\(/);
    assert.match(route, /status: 403/);
  }
});

test("admission and teaching document APIs deny unresolved password rotation", () => {
  for (const path of [
    "src/app/api/official-documents/admission-application/route.ts",
    "src/app/api/official-documents/teaching-plan/route.ts",
    "src/app/api/official-documents/teaching-pack/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /try\s*\{\s*context = await getUserContext\(\);/);
    assert.match(route, /catch\s*\{\s*return Response\.json\(/);
    assert.match(route, /status: 403/);
  }
});

test("class-list export denies unresolved rotation authority with JSON 403", () => {
  const route = read("src/app/api/official-documents/class-list/route.ts");
  assert.match(route, /try\s*\{\s*context = await getUserContext\(\);/);
  assert.match(route, /catch\s*\{\s*return Response\.json\(/);
  assert.match(route, /status: 403/);
});

test("report card signed artifact URLs cannot be issued before password rotation", () => {
  const route = read("src/app/api/report-card-documents/[documentId]/route.ts");
  assert.match(route, /securityProfile\.must_change_password !== false/);
  assert.ok(route.indexOf("securityProfile.must_change_password") < route.indexOf("createSignedUrl(document.storage_path, 90)"));
});

test("correspondence exports fail closed when authority resolution is denied", () => {
  const route = read("src/app/api/official-documents/correspondence/[documentId]/route.ts");
  assert.match(route, /try \{ context = await getUserContext\(\); \} catch/);
  assert.match(route, /status:403/);
});

test("report batch and teaching file URLs require password rotation clearance", () => {
  for (const path of [
    "src/app/api/report-card-batches/[batchId]/export/route.ts",
    "src/app/api/teaching/files/[documentId]/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /securityProfile\.must_change_password !== false/);
    assert.match(route, /status: 403/);
    assert.ok(route.indexOf("securityProfile.must_change_password") < route.indexOf("createSignedUrl("));
  }
});

test("teaching inspection and professional review downloads enforce rotation gate", () => {
  for (const path of [
    "src/app/api/teaching/files/inspection-pack/route.ts",
    "src/app/api/teaching/subject-file/inspection-pack/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /try \{ context = await getUserContext\(\); \}/);
    assert.match(route, /status: 403/);
  }
  const review = read("src/app/api/teaching/reviews/professional-files/[id]/route.ts");
  assert.match(review, /securityProfile\.must_change_password !== false/);
  assert.ok(review.indexOf("securityProfile.must_change_password") < review.indexOf("createSignedUrl("));
});

test("AI drafting endpoints deny mandatory password rotation with JSON 403", () => {
  for (const path of [
    "src/app/api/teaching/lesson-preparation/ai/route.ts",
    "src/app/api/correspondence/ai/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /try\s*\{\s*context = await getUserContext\(\);/);
    assert.match(route, /status: 403/);
  }
});

test("report processing and learner transfer exports fail closed during password rotation", () => {
  for (const [path, response] of [
    ["src/app/api/report-card-batches/process/route.ts", "NextResponse"],
    ["src/app/api/official-documents/learner-transfer-form/[snapshotId]/route.ts", "Response"],
  ]) {
    const route = read(path);
    assert.match(route, /try\s*\{\s*context = await getUserContext\(\);/);
    assert.ok(route.includes(`return ${response}.json({ error: "Complete account security setup and verify school access." }, { status: 403 })`));
  }
});

test("shared server authority resolver also fails closed for missing profiles", () => {
  const resolver = read("src/lib/auth/get-user-context.ts");
  assert.match(resolver, /!rpcRow\?\.profile \|\| rpcRow\.profile\.must_change_password !== false/);
  assert.match(resolver, /throw new Error\("Password rotation required before accessing school authority\."\)/);
});
