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
  assert.ok(server.includes("row.required && row.contributes_to_report"));
  assert.ok(server.includes('["verified", "locked"].includes(row.status)'));
  assert.ok(server.includes("!row.correction_pending"));
  assert.ok(server.includes("ready: required > 0 && required === verifiedRequired"));
  assert.ok(view.includes("!row.approved && verified && Boolean(scaleId) && confirmed"));
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
