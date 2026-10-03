import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync("supabase/migrations/20261003123000_official_academic_schedules.sql","utf8");
const server=readFileSync("src/features/reporting/server/academic-schedules.ts","utf8");
const page=readFileSync("src/app/reports/academic-schedules/page.tsx","utf8");
const printPage=readFileSync("src/app/reports/academic-schedules/print/page.tsx","utf8");
const xlsx=readFileSync("src/features/reporting/server/render-academic-schedule-xlsx.ts","utf8");
const actions=readFileSync("src/features/reporting/server/academic-schedule-actions.ts","utf8");
const academicAnalysis=readFileSync("src/features/academics/server/academic-analysis.ts","utf8");
const exportRoute=readFileSync("src/app/reports/academic-schedules/export.xlsx/route.ts","utf8");
const liveProfile=readFileSync("src/features/documents/server/live-school-document-profile.ts","utf8");
const finalizeForm=readFileSync("src/features/reporting/academic-schedule-finalize-form.tsx","utf8");

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

test("all eight required schedule families are exposed",()=>{
  for(const key of ["term_schedule","promotion_schedule","retention_at_risk","incomplete_results","subject_failure","top_achievers","class_grade_summary","promotion_exceptions"]){
    assert.match(server,new RegExp(key));
  }
});

test("preview, print PDF path and Excel export preserve explicit basis",()=>{
  assert.match(page,/Print \/ PDF/);
  assert.match(page,/Excel/);
  assert.match(page,/Template fidelity pending/);
  assert.match(page,/Open issued version/);
  assert.doesNotMatch(page,/<select\b/i);
  assert.match(printPage,/PROVISIONAL/);
  assert.match(printPage,/counter\(page\)/);
  assert.match(xlsx,/Basis: /);
  assert.match(printPage,/getAcademicScheduleSnapshot/);
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
