import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync("src/features/assessment/server/official-result-approval.ts", "utf8");
const view = readFileSync("src/features/assessment/official-result-approval-view.tsx", "utf8");
const page = readFileSync("src/app/assessment/results/page.tsx", "utf8");
const dashboard = readFileSync("src/app/assessment/page.tsx", "utf8");

test("official approval is restricted to current school leadership", () => {
  assert.ok(server.includes("context.currentSchoolMembership"));
  assert.ok(server.includes('"school_admin", "principal", "deputy_principal"'));
  assert.ok(server.includes("context.platformMemberships.length"));
  assert.ok(page.includes('if (!workspace) redirect("/assessment")'));
  assert.ok(dashboard.includes('canApprove ? <Link href="/assessment/results"'));
});

test("server action delegates only to the canonical governed RPC", () => {
  assert.ok(server.includes('db.rpc("approve_official_subject_result"'));
  assert.ok(!server.includes("createSupabaseAdminClient"));
  assert.ok(!server.includes('db.from("official_results").insert'));
  assert.ok(server.includes('confirmed: z.literal("yes")'));
  assert.ok(server.includes("gradingScaleId: uuid"));
  assert.ok(server.includes("termNumber: z.coerce.number().int().min(1).max(3)"));
});

test("server checks school, year, scheme, grade and active grading scale", () => {
  assert.ok(server.includes('.eq("school_id", schoolId)'));
  assert.ok(server.includes("scheme.academic_year !== enrolment.academic_year"));
  assert.ok(server.includes("offering.grade_id !== enrolment.grade_id"));
  assert.ok(server.includes('db.from("learner_subject_registrations")'));
  assert.ok(server.includes('.eq("status", "active")'));
  assert.ok(server.includes('scheme.status !== "active"'));
  assert.ok(server.includes('scale.status !== "active"'));
});

test("readiness checks required components, verification and corrections", () => {
  assert.ok(server.includes("row.contributes_to_report && (row.term_numbers ?? [1, 2, 3]).includes(termNumber)"));
  assert.ok(server.includes("row.required && contributing.has(row.id)"));
  assert.ok(server.includes('["verified", "locked"].includes(row.status)'));
  assert.ok(server.includes("!row.correction_pending"));
  assert.ok(server.includes("ready: required > 0 && required === verifiedRequired && !pendingContributing"));
  assert.ok(server.includes("contributing.has(row.assessment_component_id) && row.correction_pending"));
  assert.ok(server.includes("&& !pendingContributing)"));
  assert.ok(server.includes("All contributing mark corrections, including optional components"));

  assert.ok(view.includes("row.registered && (!row.approved || row.replacementEligible) && verified && Boolean(scaleId) && confirmed"));
  assert.ok(server.includes("replacementEligible: Boolean(official) && corrected.has(row.id)"));
  assert.ok(server.includes("correction_authorization_id is a foreign key"));
  assert.ok(!server.includes('db.from("assessment_mark_reopen_authorizations")'));
  assert.ok(server.includes("mark.recorded_at"));

  assert.ok(view.includes("Reapprove corrected"));
  assert.ok(server.includes("Existing official result requires"));
  assert.ok(!view.includes("row.registered && !row.approved"));

});

test("reapproval eligibility uses stable bounded pagination without losing proven corrections", () => {
  assert.ok(server.includes("for (let offset = 0; corrected.size < candidateEnrolments.length; offset += pageSize)"));
  assert.ok(server.includes('.in("enrolment_id", candidateEnrolments)'));
  assert.ok(server.includes(".range(offset, offset + pageSize - 1)"));
  assert.ok(server.includes("corrected.add(mark.enrolment_id)"));
  assert.ok(!server.includes("(marks ?? []).length < 1000"));
});

test("grading scale and explicit confirmation are user-selected, never defaulted", () => {
  assert.ok(view.includes('useState("")'));
  assert.ok(view.includes("useState(false)"));
  assert.ok(view.includes('name="gradingScaleId"'));
  assert.ok(view.includes('name="confirmed"'));
  assert.ok(view.includes("CheckboxField"));
  assert.ok(view.includes('label="Grading scale and version"'));
  assert.ok(view.includes('href="/assessment/grading-scales"'));
});
