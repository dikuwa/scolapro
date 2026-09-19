import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const form = read("src/features/profile-changes/learner-change-request-form.tsx");
const actions = read("src/features/profile-changes/server/actions.ts");
const queries = read("src/features/profile-changes/server/queries.ts");
const review = read("src/features/profile-changes/profile-change-review-list.tsx");
const learner = read("src/app/learners/[id]/page.tsx");
const parent = read("src/features/parents/parent-portal.tsx");
const portal = read("src/features/parents/server/portal.ts");
const migration = read("supabase/migrations/20260919150000_profile_change_intake_metadata.sql");

test("correction intake stays on the canonical profile-change workflow", () => {
  assert.match(actions, /submit_profile_change_request/);
  assert.match(actions, /cancel_profile_change_request/);
  assert.doesNotMatch(migration, /create table.*correction|correction_requests/i);
});

test("staff learner intake captures source and optional evidence without direct mutation", () => {
  assert.match(learner, /LearnerChangeRequestForm/);
  assert.match(form, /sourceCategory/);
  assert.match(form, /evidenceReference/);
  assert.match(form, /Pending|pending/);
  assert.doesNotMatch(form, /supabase|\.update\(|\.insert\(|\.delete\(/);
});

test("parent intake is linked to selected current family learner", () => {
  assert.match(parent, /Report incorrect details/);
  assert.match(parent, /parentMode/);
  assert.match(portal, /get_parent_family_overview/);
  assert.match(migration, /is_current_guardian_user_for_learner/);
});

test("review queue exposes provenance and before/after values", () => {
  for (const text of ["Requester:", "Source:", "Evidence/reference:", "Current", "Proposed"]) assert.match(review, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(form, /Review result/);
  assert.match(queries, /requested_by_user_id/);
  assert.match(queries, /source_category/);
});

test("requester can view and cancel pending requests", () => {
  assert.match(form, /Cancel pending request/);
  assert.match(actions, /cancelProfileChange/);
  assert.match(actions, /revalidatePath\("\/parent"\)/);
});

test("source categories and metadata remain policy-driven and bounded", () => {
  for (const category of ["parent_guardian_report", "learner_report", "teacher_observation", "admin_detected_error", "verified_document", "other"]) assert.match(migration, new RegExp(category));
  assert.match(migration, /evidence requirements remain policy\/configuration driven/i);
  assert.match(form, /flex flex-wrap/);
  assert.match(parent, /lg:grid-cols-2/);
});
