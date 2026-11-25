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

test("server checks school, year, scheme, grade and governed grading scale statuses", () => {
  assert.ok(server.includes('.eq("school_id", schoolId)'));
  assert.ok(server.includes("scheme.academic_year !== enrolment.academic_year"));
  assert.ok(server.includes("offering.grade_id !== enrolment.grade_id"));
  assert.ok(server.includes('db.from("learner_subject_registrations")'));
  assert.ok(server.includes('.eq("status", "active")'));
  assert.ok(server.includes('scheme.status !== "active"'));
  assert.ok(server.includes('!["active", "superseded", "archived"].includes(scale.status)'));
  assert.ok(server.includes("Corrections must use the original official grading scale version"));
});

test("readiness checks required components, verification and corrections", () => {
  assert.ok(server.includes("row.contributes_to_report && (row.term_numbers ?? [1, 2, 3]).includes(termNumber)"));
  assert.ok(server.includes("row.required && contributing.has(row.id)"));
  assert.ok(server.includes('["verified", "locked"].includes(row.status)'));
  assert.ok(server.includes("!row.correction_pending"));
  assert.ok(server.includes("ready: required > 0 && required === verifiedRequired && !pendingContributing && Boolean(termEnd)"));
  assert.ok(server.includes("contributing.has(row.assessment_component_id) && row.correction_pending"));
  assert.ok(server.includes("&& !pendingContributing)"));
  assert.ok(server.includes("All contributing mark corrections, including optional components"));

  assert.ok(view.includes("row.registered && (!row.approved || row.replacementEligible) && verified"));
  assert.ok(view.includes("&& Boolean(scaleId) && Boolean(compatibleScale) && confirmed"));
  assert.ok(server.includes("replacementEligible: Boolean(official) && corrected.has(row.id)"));
  assert.ok(server.includes('not("correction_authorization_id", "is", null)'));
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

test("official approval resolves school term end and excludes inapplicable scale versions", () => {
  const migration = readFileSync("supabase/migrations/20261123171000_official_result_term_grading_scale_applicability.sql", "utf8");
  assert.ok(migration.includes("join public.academic_years y on y.id=t.academic_year_id"));
  assert.ok(migration.includes("and y.year=v_scheme.academic_year"));
  assert.ok(migration.includes("and t.term_number=p_term_number"));
  assert.ok(migration.includes("v_scale.effective_from>v_term_end"));
  assert.ok(migration.includes("v_scale.effective_to<v_term_end"));
  assert.ok(migration.includes("for update of ai"), "the term-end migration must preserve correction serialization from the earlier reapproval migration");
  assert.ok(migration.includes("'grading_scale_reference_date',v_term_end"));
  assert.ok(migration.includes("'grading_scale_reference_basis','academic_term_end'"));
  assert.ok(migration.includes("Configure the academic term end date before approving official results"));
  assert.ok(server.includes('db.from("academic_terms")'));
  assert.ok(server.includes("row.effective_from <= termEnd"));
  assert.ok(server.includes("row.effective_to >= termEnd"));
  assert.ok(view.includes("A later correction uses the same term date"));
  assert.ok(view.includes('href="/school/setup"'));
});

test("term-end scale governance fails closed across schools and uses inclusive effective dates", () => {
  const migration = readFileSync("supabase/migrations/20261123171000_official_result_term_grading_scale_applicability.sql", "utf8");
  assert.ok(migration.includes("t.school_id=v_scheme.school_id"));
  assert.ok(migration.includes("y.school_id=v_scheme.school_id"));
  assert.ok(migration.includes("y.year=v_scheme.academic_year"));
  assert.ok(migration.includes("if v_term_end is null then"));
  assert.ok(migration.includes("v_scale.effective_from>v_term_end"));
  assert.ok(migration.includes("v_scale.effective_to<v_term_end"));
  assert.ok(!migration.includes("v_scale.effective_from>=v_term_end"));
  assert.ok(!migration.includes("v_scale.effective_to<=v_term_end"));
  assert.ok(server.includes("row.effective_from <= termEnd"));
  assert.ok(server.includes("row.effective_to == null || row.effective_to >= termEnd"));
  assert.ok(migration.includes("for update of ai"));
  assert.ok(migration.includes("v_scale.school_id<>v_scheme.school_id"));
  assert.ok(migration.includes("app_private.can_manage_current_assessment_school"));
});

test("historical correction reuses only the originally approved grading scale", () => {
  const migration = readFileSync("supabase/migrations/20261123171000_official_result_term_grading_scale_applicability.sql", "utf8");
  assert.ok(migration.includes("v_scale.scale_key is distinct from v_previous.grading_scale_key"));
  assert.ok(migration.includes("v_scale.version is distinct from v_previous.grading_scale_version"));
  assert.ok(migration.includes("v_scale.status not in ('active','superseded','archived')"));
  assert.ok(migration.includes("Initial official approval requires an active grading scale"));
  assert.ok(migration.includes("Corrected official result must reuse its original grading scale version"));
  assert.ok(server.includes('select("enrolment_id,result_value,symbol,approved_at,grading_scale_key,grading_scale_version")'));
  assert.ok(server.includes("historicVersions.has(JSON.stringify([scale.scale_key, scale.version]))"));
  assert.ok(server.includes("scale.status === \"active\""));
  assert.ok(view.includes("selectedScale.scaleKey === row.gradingScaleKey"));
  assert.ok(view.includes("selectedScale.scaleVersion === row.gradingScaleVersion"));
  assert.ok(view.includes("!selectedScale.historical"));
});
