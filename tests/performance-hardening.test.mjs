import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const shell = await read("src/components/shell/app-shell.tsx");
const notifications = await read("src/features/notifications/server/notifications.ts");

test("app shell reuses the authenticated user id for notification loading", () => {
  assert.match(shell, /authenticatedUserId: context\.user\.id/);
  assert.match(notifications, /authenticatedUserId\?: string \| null/);
  assert.match(notifications, /context\.authenticatedUserId \?\?/);
  assert.match(notifications, /recipient_user_id", recipientUserId/);
});

test("notification loader still fails closed when no authenticated user is available", () => {
  assert.match(notifications, /supabase\.auth\.getUser\(\)/);
  assert.match(notifications, /if \(!recipientUserId\) return \{ unreadCount: 0, notifications: \[\]/);
});


test("shell defers notification inbox behind Suspense instead of blocking the critical shell", () => {
  assert.match(shell, /<Suspense fallback=\{<NotificationCenter unreadCount=\{0\} notifications=\{\[\]\} \/>\}>/);
  assert.match(shell, /async function ShellNotificationCenter/);
  assert.match(shell, /notificationContext/);
});

test("shell keeps only required supplemental lookups on the server critical path", () => {
  assert.match(shell, /Promise\.all\(\[/);
  assert.match(shell, /dutyPromise/);
  assert.match(shell, /inventoryPromise/);
  assert.doesNotMatch(shell, /attentionPromise/);
  assert.match(shell, /attentionCacheKey/);
});
