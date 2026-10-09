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
  assert.match(proxy, /profileError \|\| !profile \|\| profile\.must_change_password === true/);
  assert.match(proxy, /rotationUrl\.pathname = "\/password-rotation"/);
});
test("rotation has a dedicated authenticated page without an app shell", () => {
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /if \(!user\) redirect\("\/login"\)/);
  assert.match(route, /if \(!profile\?\.must_change_password\) redirect\("\/"\)/);
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
  assert.match(login, /if \(profileError \|\| !profile \|\| profile\.must_change_password === true\)/);
  assert.match(login, /redirect\("\/password-rotation"\)/);
});

test("server-side role context rejects users who must rotate passwords", () => {
  const context = read("src/lib/auth/get-user-context.ts");
  assert.match(context, /rpcRow\?\.profile\?\.must_change_password === true/);
  assert.match(context, /Password rotation required before accessing school authority/);
});

test("invitation acceptance cannot grant roles before forced password rotation", () => {
  const invitations = read("src/features/auth/invitation-actions.ts");
  const action = invitations.slice(invitations.indexOf("export async function acceptInvitation("));
  assert.match(action, /rotationProfile\.must_change_password/);
  assert.match(action, /redirect\("\/password-rotation"\)/);
  assert.ok(action.indexOf("rotationProfile.must_change_password") < action.indexOf('supabase.rpc("accept_school_invitation"'));
});

test("automatic signup cannot accept invitation before account security check", () => {
  const invitations = read("src/features/auth/invitation-actions.ts");
  const signup = invitations.slice(invitations.indexOf("export async function signUpForInvitation("), invitations.indexOf("export async function acceptInvitation("));
  assert.match(signup, /signupProfileError \|\| !signupProfile \|\| signupProfile\.must_change_password/);
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
  assert.ok(route.indexOf("context = await getUserContext()") < route.indexOf("submitDailyRegister"));
});
