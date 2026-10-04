import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync("supabase/migrations/20261003123000_official_academic_schedules.sql","utf8");
const scopeMigration=readFileSync("supabase/migrations/20261004014000_academic_schedule_snapshot_scope.sql","utf8");
const server=readFileSync("src/features/reporting/server/academic-schedules.ts","utf8");
const page=readFileSync("src/app/reports/academic-schedules/page.tsx","utf8");
const printPage=readFileSync("src/app/reports/academic-schedules/print/page.tsx","utf8");
const xlsx=readFileSync("src/features/reporting/server/render-academic-schedule-xlsx.ts","utf8");
const actions=readFileSync("src/features/reporting/server/academic-schedule-actions.ts","utf8");
const academicAnalysis=readFileSync("src/features/academics/server/academic-analysis.ts","utf8");
const exportRoute=readFileSync("src/app/reports/academic-schedules/export.xlsx/route.ts","utf8");
const liveProfile=readFileSync("src/features/documents/server/live-school-document-profile.ts","utf8");
const finalizeForm=readFileSync("src/features/reporting/academic-schedule-finalize-form.tsx","utf8");
const filters=readFileSync("src/features/reporting/academic-schedule-filters.tsx","utf8");
const analysisPage=readFileSync("src/app/academics/analysis/page.tsx","utf8");

test("finalized official schedules are immutable, versioned and audited",()=>{
  assert.match(migration,/academic_schedule_snapshots/);
  assert.match(migration,/academic_schedule_snapshot_immutability_trg/);
  assert.match(migration,/superseded_by_snapshot_id/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/academic_schedule_finalized/);
  assert.match(migration,/deferrable initially deferred/);
  assert.match(migration,/A supersession reason is required when replacing an issued schedule/);
  assert.match(migration,/Academic schedule payload does not match its governed scope/);
  assert.match(migration,/Only official-basis academic schedules may be finalized/);
});

test("schedule generation reuses canonical current results, assessment readiness and promotion readiness",()=>{
  assert.match(server,/getAcademicAnalysisWorkspace/);
  assert.match(academicAnalysis,/from\("official_results_current"\)/);
  assert.doesNotMatch(academicAnalysis,/from\("official_results"\)/);
  assert.match(server,/get_assessment_quality_readiness/);
  assert.match(server,/promotionReadiness/);
  assert.doesNotMatch(server,/calculate_subject_result/);
  assert.doesNotMatch(server,/evaluate_promotion_recommendation/);
});

test("legacy schedule keys stay server compatible and official UI is document-first",()=>{
  for(const key of ["term_schedule","promotion_schedule","retention_at_risk","incomplete_results","subject_failure","top_achievers","class_grade_summary","promotion_exceptions"]){
    assert.match(server,new RegExp(key));
  }
  assert.match(server,/promotion_all_terms/);
  assert.match(filters,/Promotion Schedule/);
  assert.match(filters,/All Results Schedule/);
  assert.doesNotMatch(filters,/Group By|Promotion Subjects|Active Subjects|Show Progression Code/);
});

test("preview, print PDF path and Excel export preserve explicit basis",()=>{
  assert.match(page,/Print \/ PDF/);
  assert.match(page,/Excel/);
  assert.doesNotMatch(page,/Template fidelity pending/);
  assert.match(actions,/supplied_source_verified/);
  assert.match(page,/Open issued version/);
  assert.doesNotMatch(page,/<select\b/i);
  assert.match(printPage,/PROVISIONAL/);
  assert.match(printPage,/counter\(page\)/);
  assert.match(xlsx,/Basis: /);
  assert.match(printPage,/getAcademicScheduleSnapshot/);
});

test("supplied-source document semantics are represented without invented fields",()=>{
  for(const label of ["Home Language","Birth Date","Days Absent","Years in Grade","Years in Phase","Support comments","Recommendation","Ruling","Remarks","Maximum Mark","Minimum pass \/ promotion threshold"]){
    assert.match(server,new RegExp(label,"i"));
  }
  assert.match(printPage,/@page\{size:A4 landscape/);
  assert.match(printPage,/Class Teacher/);
  assert.match(printPage,/Regional Director/);
  assert.match(printPage,/Outcome analysis/);
  assert.match(printPage,/School Stamp/);
  assert.match(server,/official_results_current/);
  assert.match(server,/daily_register_current/);
  assert.match(server,/year_end_progressions/);
});

test("all-terms scope is explicit and cannot collide with ordinary finalized terms",()=>{
  assert.match(server,/period: allTerms \? "all_terms" : "term"/);
  assert.match(scopeMigration,/scope_key/);
  assert.match(scopeMigration,/promotion_all_terms/);
  assert.match(scopeMigration,/academic_schedule_snapshot_scope_version_key/);
  assert.match(scopeMigration,/p_payload->>'scopeKey' is distinct from v_scope_key/);
  assert.match(actions,/p_scope_key: payload\.scopeKey/);
});

test("analytical families are exposed under Academic Analysis",()=>{
  for(const label of ["Retention / At-Risk","Incomplete Results","Subject Failure","Top Achievers","Class / Grade Results Summary","Promotion Decision Exceptions"]){
    assert.match(analysisPage,new RegExp(label.replace("/","\\/")));
  }
  assert.match(page,/ANALYSIS_COMPAT/);
});


test("official finalization is server-trusted and authenticated clients cannot submit payloads directly",()=>{
  assert.match(migration,/to service_role/);
  assert.match(migration,/from public,anon,authenticated/);
  assert.match(migration,/p_actor_user_id uuid/);
  assert.match(actions,/createSupabaseAdminClient/);
  assert.match(actions,/p_actor_user_id: context\.user\.id/);
});

test("issued history fails closed and visibly preserves lifecycle metadata",()=>{
  assert.match(printPage,/if\(params\.snapshot && !frozen\) notFound\(\)/);
  assert.match(printPage,/SUPERSEDED — retained historical version/);
  assert.match(printPage,/Issued version v/);
  assert.match(exportRoute,/Issued schedule snapshot not found/);
  assert.match(xlsx,/Issued version v/);
  assert.match(xlsx,/lifecycle\.version/);
  assert.match(xlsx,/lifecycle\.status/);
});

test("frozen document assets are re-signed from immutable storage paths",()=>{
  assert.match(liveProfile,/resolveFrozenOfficialDocumentHeaderAssets/);
  assert.match(liveProfile,/createSignedUrl\(header\.logoStoragePath, 3600\)/);
  assert.match(liveProfile,/source: "frozen_snapshot"/);
});

test("finalization surfaces pending and result feedback",()=>{
  assert.match(actions,/try \{/);
  assert.match(actions,/catch \{/);
  assert.match(actions,/Unable to finalize the academic schedule from canonical academic data/);
  assert.match(finalizeForm,/useActionState/);
  assert.match(finalizeForm,/useFormStatus/);
  assert.match(finalizeForm,/Finalizing…/);
  assert.match(finalizeForm,/role="status"/);
});
