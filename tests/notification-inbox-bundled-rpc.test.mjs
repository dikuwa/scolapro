import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync("src/features/notifications/server/notifications.ts", "utf8");

test("notification inbox collapses unread count and latest rows into one RPC", () => {
  assert.match(inbox, /supabase\.rpc\("get_my_notification_inbox", \{ p_limit: limit \}\)/);
  assert.doesNotMatch(inbox, /\.from\("notifications"\)/);
  assert.doesNotMatch(inbox, /count: "exact"/);
});

test("notification inbox keeps authenticated fallback and return shape", () => {
  assert.match(inbox, /context\.authenticatedUserId \?\?/);
  assert.match(inbox, /supabase\.auth\.getUser\(\)/);
  assert.match(inbox, /unreadCount:/);
  assert.match(inbox, /notifications:/);
});

test("notification inbox keeps legacy invitation routing in TypeScript", () => {
  assert.match(inbox, /item\.title === "School invitation accepted"/);
  assert.match(inbox, /item\.href === "\/platform\/invitations"/);
  assert.match(inbox, /context\.roleKey === "school_admin"/);
  assert.match(inbox, /"\/school\/invitations"/);
});
