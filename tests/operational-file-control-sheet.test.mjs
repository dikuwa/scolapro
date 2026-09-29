import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("src/features/teaching/server/operational-file-control-sheet.ts", "utf8");
const ui = readFileSync("src/features/teaching/components/operational-file-control-sheet.tsx", "utf8");
const page = readFileSync("src/app/teaching/files/page.tsx", "utf8");

test("control sheet projects existing review foundations rather than creating a lifecycle", () => {
  assert.match(server, /preparation_submissions/);
  assert.match(server, /preparation_review_events/);
  assert.match(server, /teacher_professional_document_review_submissions/);
  assert.match(server, /teacher_professional_document_review_events/);
  assert.doesNotMatch(server, /\.insert\(/);
  assert.doesNotMatch(server, /\.update\(/);
  assert.doesNotMatch(server, /\.delete\(/);
  assert.doesNotMatch(server, /\.rpc\(/);
});

test("teacher control-sheet reads remain current-school owner scoped", () => {
  assert.match(server, /context\.currentSchoolMembership/);
  assert.match(server, /context\.platformMemberships\.length/);
  assert.match(server, /\.eq\("school_id", membership\.schoolId\)/);
  assert.match(server, /\.eq\("submitted_by_user_id", context\.user\.id\)/);
  assert.match(server, /\.eq\("owner_staff_member_id", membership\.staffMemberId\)/);
});

test("preparation monitoring preserves real review period and append-only event history", () => {
  assert.match(server, /scope_kind/);
  assert.match(server, /week_start/);
  assert.match(server, /week_end/);
  assert.match(server, /term_label/);
  assert.match(server, /event_kind/);
  assert.match(server, /actor_role_snapshot/);
  assert.match(server, /reviewed_at/);
  assert.match(server, /review_note/);
});

test("readiness remains distinct from review status in the control-sheet UI", () => {
  assert.match(ui, /Readiness and review are shown separately/);
  assert.match(ui, /A linked or available item is not treated as HOD-reviewed unless an existing review event proves it/);
  assert.match(ui, /Available \/ linked/);
  assert.match(ui, /Missing \/ unavailable/);
  assert.match(ui, /Existing review history/);
});

test("review lifecycle states remain visible without synthesis", () => {
  assert.match(ui, /status === "reviewed"/);
  assert.match(ui, /status === "returned"/);
  assert.match(ui, /event\.eventKind/);
  assert.match(ui, /event\.actorRole/);
  assert.match(ui, /event\.comment/);
});

test("Teaching Files integrates the read-only control sheet alongside operational files", () => {
  assert.match(page, /getOperationalFileControlSheet\(academicYear\)/);
  assert.match(page, /<OperationalFileControlSheetView workspace=\{operationalWorkspace\} controlSheet=\{controlSheet\}/);
  assert.match(page, /<OperationalTeachingFiles workspace=\{operationalWorkspace\}/);
  assert.match(page, /<TeachingFilesHub/);
});
