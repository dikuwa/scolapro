import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const join = source("src/app/join/page.tsx");
const joinForm = source("src/features/auth/invitation-join-form.tsx");
const actions = source("src/features/auth/invitation-actions.ts");
const schoolPage = source("src/app/school/invitations/page.tsx");
const platformPage = source("src/app/platform/invitations/page.tsx");
const invitationQueries = source("src/features/platform/server/invitations.ts");
const preview = source("supabase/migrations/20260827214500_invitation_preview.sql");
const currentScope = source("supabase/migrations/20260912201500_staffing_membership_mutation_current_scope.sql");
const finality = source("supabase/migrations/20260909002000_platform_onboarding_invitation_hardening.sql");
const notificationIsolation = source("supabase/migrations/20260919100000_school_invitation_notification_failure_isolation.sql");

test("platform and school invitation surfaces remain authority-separated", () => {
  assert.match(platformPage, /roleKey === "platform_admin"/);
  assert.match(schoolPage, /roleKey === "school_admin"/);
  assert.match(invitationQueries, /role_key", "platform_admin"/);
  assert.match(invitationQueries, /\.eq\("school_id", schoolId\)/);
});

test("school invitation creation uses deterministic current-school authority and effective placement", () => {
  assert.match(currentScope, /user_targets_current_school/);
  assert.match(currentScope, /staff_member_covers_school_period/);
  assert.match(currentScope, /user_can_manage_current_school_membership/);
  assert.match(currentScope, /role_key='platform_admin'/);
  assert.doesNotMatch(currentScope, /role_key='platform_support'/);
});

test("public preview is possession-based and exposes only the invitation target", () => {
  assert.match(preview, /token_hash = encode\(digest\(p_token/);
  assert.match(preview, /si\.status = 'pending'/);
  assert.match(preview, /si\.expires_at > now\(\)/);
  assert.match(preview, /school_name/);
  assert.match(preview, /tenant_name/);
  assert.doesNotMatch(preview, /select \*/i);
});

test("acceptance is final and same-identity replay is idempotent", () => {
  assert.match(finality, /if v_invite\.status = 'accepted'/);
  assert.match(finality, /accepted_user_id is distinct from auth\.uid\(\)/);
  assert.match(finality, /if v_invite\.status = 'revoked'/);
  assert.match(finality, /v_invite\.expires_at <= now\(\)/);
  assert.match(finality, /staff_school_assignments/);
  assert.match(finality, /school_memberships/);
});

test("notification failures are isolated from authoritative acceptance", () => {
  assert.match(notificationIsolation, /exception\s+when others then/i);
  assert.match(notificationIsolation, /School invitation notification side effect failed/);
  assert.match(notificationIsolation, /return new/);
});

test("join and admin surfaces retain loading, empty/error, and responsive states", () => {
  assert.match(join, /Invitation unavailable/);
  assert.match(join, /sm:px-6 lg:px-8/);
  assert.match(join, /lg:grid-cols-/);
  assert.match(joinForm, /acceptPending/);
  assert.match(joinForm, /signupPending/);
  assert.match(joinForm, /LoaderCircle/);
  assert.match(schoolPage, /No invitations yet/);
  assert.match(platformPage, /No platform invitations yet/);
  assert.match(schoolPage, /sm:grid-cols-2/);
  assert.match(platformPage, /xl:grid-cols-/);
});

test("join actions do not expose browser-native alert or confirm", () => {
  assert.doesNotMatch(joinForm, /\balert\s*\(/);
  assert.doesNotMatch(joinForm, /\bconfirm\s*\(/);
  assert.doesNotMatch(actions, /\balert\s*\(/);
  assert.doesNotMatch(actions, /\bconfirm\s*\(/);
});
