import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = source("src/app/parent/page.tsx");
const portal = source("src/features/parents/parent-portal.tsx");
const portalQueries = source("src/features/parents/server/portal.ts");
const absenceQueries = source("src/features/parents/server/absence-queries.ts");
const absenceActions = source("src/features/parents/server/absence-actions.ts");
const globalLoading = source("src/app/loading.tsx");
const globalError = source("src/app/error.tsx");

test("parent portal switches only among guardian-scoped family learners", () => {
  assert.match(portal, /selectedLearnerId/);
  assert.match(portal, /familyChildren\.map/);
  assert.match(portal, /Switch between linked learners/);
  assert.match(portalQueries, /get_parent_family_overview/);
});

test("parent portal reads only published report snapshots and ready report documents", () => {
  assert.match(portalQueries, /\.eq\("status", "published"\)/);
  assert.match(portalQueries, /\.from\("report_card_documents"\)/);
  assert.match(portalQueries, /\.eq\("status", "ready"\)/);
  assert.doesNotMatch(portalQueries, /subject_result_readiness|assessment_entries|moderation/i);
});

test("guardian absence workflow is wired into the canonical parent route without rewriting attendance", () => {
  assert.match(page, /getParentAbsenceNotices/);
  assert.match(page, /absenceNotices=\{absenceNotices\}/);
  assert.match(portal, /AbsenceNoticeForm/);
  assert.match(portal, /Absence notice history/);
  assert.match(portal, /never changes the official attendance register by itself/);
  assert.match(absenceActions, /submit_guardian_absence_notice/);
  assert.doesNotMatch(absenceActions, /attendance_events.*(?:insert|update)|(?:insert|update).*attendance_events/i);
});

test("absence notice query failures reach the route error boundary instead of masquerading as empty state", () => {
  assert.match(absenceQueries, /if \(error\) throw new Error\("Unable to load your absence notices\."\)/);
  assert.match(globalError, /Something did not load correctly/);
  assert.match(globalLoading, /aria-busy="true"/);
});

test("parent portal keeps finance and direct-message surfaces narrow", () => {
  assert.match(portalQueries, /get_parent_finance_overview/);
  assert.match(portalQueries, /get_parent_message_overview/);
  assert.doesNotMatch(portalQueries, /learner_support|disciplin|access_arrangement|examination_registration/i);
});

test("parent portal layout preserves mobile tablet and desktop responsive primitives", () => {
  assert.match(portal, /sm:grid-cols-3/);
  assert.match(portal, /lg:grid-cols-2/);
  assert.match(portal, /flex flex-col gap-2 sm:flex-row/);
  assert.match(portal, /grid grid-cols-2 gap-2 sm:grid-cols-3/);
});
