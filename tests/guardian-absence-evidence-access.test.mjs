import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261125120000_guardian_absence_evidence_reviewer_authority.sql", import.meta.url),
  "utf8",
);
const pgTap = readFileSync(
  new URL("../supabase/tests/guardian_absence_evidence_reviewer_authority_test.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../src/app/api/guardian-absence-evidence/[attachmentId]/route.ts", import.meta.url),
  "utf8",
);
const queries = readFileSync(new URL("../src/features/parents/server/absence-queries.ts", import.meta.url), "utf8");
const parentPortal = readFileSync(new URL("../src/features/parents/parent-portal.tsx", import.meta.url), "utf8");
const reviewList = readFileSync(new URL("../src/features/parents/absence-review-list.tsx", import.meta.url), "utf8");

test("guardian absence evidence reads use the notice reviewer authority, not generic learner visibility", () => {
  assert.match(migration, /create or replace function app_private\.can_access_guardian_absence_object/);
  assert.match(migration, /or app_private\.can_review_guardian_absence_notice\(n\.id\)/);
  assert.doesNotMatch(migration, /can_view_operational_learners/);
  // The guardian branch keeps requiring a current relationship and current enrolment.
  assert.match(migration, /lg\.effective_to is null or lg\.effective_to >= current_date/);
  assert.match(migration, /e\.status = 'current'/);
  assert.match(migration, /revoke all on function app_private\.can_access_guardian_absence_object\(text\)/);
  assert.match(pgTap, /ordinary teacher with operational learner visibility cannot read absence evidence/);
  assert.match(pgTap, /HOD without notice review authority cannot read absence evidence/);
  assert.match(pgTap, /librarian cannot enumerate or sign guardian absence evidence/);
});

test("evidence download authorizes under RLS before minting a short-lived signed URL", () => {
  assert.match(route, /createSupabaseServerClient/);
  assert.match(route, /guardian_absence_notice_attachments/);
  assert.match(route, /\.eq\("id", attachmentId\)/);
  assert.match(route, /attachment\.storage_bucket !== EVIDENCE_BUCKET/);
  assert.match(route, /createSupabaseAdminClient/);
  assert.match(route, /createSignedUrl\(attachment\.storage_path, 90\)/);
  assert.match(route, /Cache-Control", "private, no-store, max-age=0/);
  assert.doesNotMatch(route, /storage_path[^\n]*json/i);
});

test("guardians and reviewers can open the evidence they are authorized to see", () => {
  assert.match(queries, /guardian_absence_notice_attachments\(id, file_name, mime_type\)/);
  assert.match(queries, /attachments: \(row\.guardian_absence_notice_attachments \?\? \[\]\)/);
  for (const component of [parentPortal, reviewList]) {
    assert.match(component, /\/api\/guardian-absence-evidence\/\$\{attachment\.id\}/);
    assert.match(component, /attachment\.fileName/);
  }
});
