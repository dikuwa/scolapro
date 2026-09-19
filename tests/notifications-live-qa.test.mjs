import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const center = source("src/features/notifications/notification-center.tsx");
const actions = source("src/features/notifications/server/actions.ts");
const inbox = source("src/features/notifications/server/notifications.ts");
const attention = source("src/features/notifications/server/navigation-attention.ts");
const shell = source("src/components/shell/app-shell.tsx");
const boundary = source("supabase/migrations/20260913032000_notification_recipient_actor_scope_hardening.sql");
const hrefFix = source("supabase/migrations/20260919092000_notification_invitation_href_relevance.sql");

test("notification inbox remains authenticated-recipient scoped and fails closed on count errors", () => {
  assert.match(inbox, /supabase\.auth\.getUser\(\)/);
  assert.match(inbox, /\.eq\("recipient_user_id", user\.id\)/);
  assert.match(inbox, /error: countError/);
  assert.match(inbox, /if \(countError \|\| error\) throw new Error\("Unable to load notifications\."\)/);
});

test("recipient mutations remain self-scoped and expose failures to the in-app UI", () => {
  assert.match(actions, /\.eq\("recipient_user_id", user\.id\)/);
  assert.match(actions, /mark_all_notifications_read/);
  assert.match(actions, /dismiss_all_notifications/);
  assert.match(actions, /success: false/);
  assert.match(center, /toast\.error/);
  assert.doesNotMatch(center, /\balert\s*\(/);
  assert.doesNotMatch(center, /\bconfirm\s*\(/);
});

test("notification badge state updates immediately after successful mutations", () => {
  assert.match(center, /setLocalUnreadCount\(\(count\) => Math\.max\(0, count - 1\)\)/);
  assert.match(center, /setLocalUnreadCount\(0\)/);
  assert.match(center, /setItems\(\[\]\)/);
  assert.match(center, /setItems\(\(current\) => current\.map/);
});

test("school notifications remain current-relationship scoped with Platform Support separation", () => {
  assert.match(boundary, /recipient_user_id = auth\.uid\(\)/);
  assert.match(boundary, /platform_support/);
  assert.match(boundary, /is_current_school\(n\.school_id\)/);
  assert.match(boundary, /staff_member_covers_school_period/);
  assert.match(boundary, /e\.status = 'current'/);
});

test("invitation acceptance notifications route by current actor authority", () => {
  assert.match(hrefFix, /v_href := '\/platform\/invitations'/);
  assert.match(hrefFix, /v_href := '\/school\/invitations'/);
  assert.match(hrefFix, /order by sm\.active_from desc, sm\.id asc/);
  assert.match(hrefFix, /role_key = 'school_admin'/);
  assert.match(hrefFix, /platform_support/);
  assert.match(hrefFix, /if v_href is not null then/);
});

test("legacy invitation hrefs are rendered safely without rewriting notification history", () => {
  assert.match(inbox, /item\.title === "School invitation accepted"/);
  assert.match(inbox, /item\.href === "\/platform\/invitations"/);
  assert.match(inbox, /context\.roleKey === "school_admin"/);
  assert.match(inbox, /"\/school\/invitations"/);
  assert.match(shell, /getNotificationInbox\(8,/);
});

test("navigation attention stays school-bound and supplemental", () => {
  assert.match(attention, /\.eq\("school_id", schoolId\)/);
  assert.match(attention, /\.eq\("status", "pending"\)/);
  assert.match(attention, /if \(!error && \(count \?\? 0\) > 0\)/);
});

test("notification center retains mobile-safe responsive bounds and empty/loading states", () => {
  assert.match(center, /w-\[min\(23rem,calc\(100vw-2rem\)\)\]/);
  assert.match(center, /max-h-\[25rem\] overflow-y-auto/);
  assert.match(center, /Spinner/);
  assert.match(center, /No notifications/);
});
