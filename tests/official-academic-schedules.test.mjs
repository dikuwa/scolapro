import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync("supabase/migrations/20261003123000_official_academic_schedules.sql","utf8");
const scopeMigration=readFileSync("supabase/migrations/20261004014000_academic_schedule_snapshot_scope.sql","utf8");
const server=readFileSync("src/features/reporting/server/academic-schedules.ts","utf8");
const page=readFileSync("src/app/reports/academic-schedules/page.tsx","utf8");
const printPage=readFileSync("src/app/reports/academic-schedules/print/page.tsx","utf8");
const xlsx=readFileSync("src/features/reporting/server/render-academic-schedule-xlsx.ts","utf8");
const pdfRenderer=readFileSync("src/features/reporting/server/render-academic-schedule-pdf.ts","utf8");
const pdfHeader=readFileSync("src/features/documents/server/official-document-pdf-header.ts","utf8");
const pdfExportRoute=readFileSync("src/app/reports/academic-schedules/export.pdf/route.ts","utf8");
const actions=readFileSync("src/features/reporting/server/academic-schedule-actions.ts","utf8");
const academicAnalysis=readFileSync("src/features/academics/server/academic-analysis.ts","utf8");
const exportRoute=readFileSync("src/app/reports/academic-schedules/export.xlsx/route.ts","utf8");
const liveProfile=readFileSync("src/features/documents/server/live-school-document-profile.ts","utf8");
const finalizeForm=readFileSync("src/features/reporting/academic-schedule-finalize-form.tsx","utf8");
const filters=readFileSync("src/features/reporting/academic-schedule-filters.tsx","utf8");
const analysisPage=readFileSync("src/app/academics/analysis/page.tsx","utf8");
const analysisPrintPage=readFileSync("src/app/academics/analysis/print/page.tsx","utf8");
const scheduleColumnLayout=readFileSync("src/features/reporting/academic-schedule-column-layout.ts","utf8");
const globals=readFileSync("src/app/globals.css","utf8");
const documentActions=readFileSync("src/components/documents/official-document-actions.tsx","utf8");
const documentPreview=readFileSync("src/components/documents/official-document-preview.tsx","utf8");
const timetableFoundation=readFileSync("supabase/migrations/20260827224500_timetable_foundation.sql","utf8");

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
  assert.match(page,/OfficialDocumentActions/);
  assert.match(page,/export\.pdf\?.*preview=1/);
  assert.match(page,/spreadsheetHref/);
  assert.doesNotMatch(page,/Template fidelity pending/);
  assert.match(actions,/supplied_source_verified/);
  assert.match(page,/snapshot=.*spreadsheetHref|OfficialDocumentActions compact/s);
  assert.doesNotMatch(page,/<select\b/i);
  assert.match(printPage,/PROVISIONAL/);
  assert.match(printPage,/counter\(page\)/);
  assert.match(xlsx,/Basis: /);
  assert.match(printPage,/getAcademicScheduleSnapshot/);
});


test("academic schedules use canonical PDF preview and compact governed heading orientation",()=>{
  assert.match(page,/OfficialDocumentActions/);
  assert.match(page,/export\.pdf\?.*preview=1/);
  assert.match(page,/OfficialDocumentPreview/);
  assert.match(page,/orientation="landscape"/);
  assert.match(documentPreview,/h-\[210mm\] w-\[297mm\]/);
  assert.match(pdfExportRoute,/renderAcademicSchedulePdf/);
  assert.match(pdfExportRoute,/preview.*inline/);
  assert.match(pdfRenderer,/pageWidth = OFFICIAL_DOCUMENT_PDF_GEOMETRY\.pageHeight/);
  assert.match(pdfRenderer,/academicScheduleHeadingOrientation/);
  assert.match(scheduleColumnLayout,/HORIZONTAL_METRIC_HEADINGS = new Set\(\["Support comments"\]\)/);
  assert.match(xlsx,/verticalHeaderColumns/);
  assert.match(documentActions,/Preview \/ Print/);
  assert.match(pdfRenderer,/textLength = bold\.widthOfTextAtSize/);
  assert.match(pdfRenderer,/top - headerHeight \/ 2 - textLength \/ 2/);
  assert.match(pdfRenderer,/rowHeight \/ 2 - size \* 0\.34/);
  assert.match(printPage,/heading-label/);
  assert.match(printPage,/translate\(-50%,-50%\) rotate\(180deg\)/);
  assert.match(pdfHeader,/documentX: options\.documentX/);
  assert.match(pdfHeader,/documentWidth: options\.documentWidth/);
});

test("supplied-source document semantics are represented without invented fields",()=>{
  for(const label of ["Home Language","DOB","Days Absent","Years in Grade","Years in Phase","Support comments","Recommendation","Ruling","Remarks","Maximum Mark","Minimum Promotion Mark"]){
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
  assert.match(server,/learner_subject_registrations/);
  assert.match(server,/promotion_rule_conditions/);
  assert.match(server,/subjectScaleRefs\.length===1/);
  assert.match(server,/competitionRanks/);
  assert.match(server,/distinctAbsenceCounts/);
  assert.match(server,/outcome:"Pass",female:null,male:null,total:null/);
});

test("all-terms scope is immutable, canonical and cannot collide with ordinary finalized terms",()=>{
  assert.match(server,/grade-id:/);
  assert.match(server,/class-ids:/);
  assert.match(server,/classIds=.*sort/);
  assert.doesNotMatch(server,/encodeURIComponent\(input\.grade/);
  assert.match(scopeMigration,/scope_key/);
  assert.match(scopeMigration,/promotion_all_terms/);
  assert.match(scopeMigration,/academic_schedule_snapshot_scope_version_key/);
  assert.match(scopeMigration,/drop function if exists public\.finalize_academic_schedule_snapshot/);
  assert.doesNotMatch(scopeMigration,/scope_key text not null default/);
  assert.match(scopeMigration,/p_payload->>'scopeKey' is distinct from v_scope_key/);
  assert.match(actions,/p_scope_key:payload\.scopeKey/);
});

test("official document cohort and subjects do not disappear when result rows are missing",()=>{
  assert.match(server,/from\("enrolments"\)/);
  assert.match(server,/loadAllOfficialResults/);
  assert.match(server,/loadActiveRegistrations/);
  assert.match(server,/subject_offerings/);
  assert.match(server,/gradeEnrolments\.map/);
  assert.match(server,/result\?\.result_value\?\?/);
});

test("official schedule screen is summary-first with simple scope controls and readiness",()=>{
  for(const label of ["Document","Period","Scope","Status","Source readiness","Open Academic Analysis with this scope"]){
    assert.match(page,new RegExp(label));
  }
  assert.match(filters,/Advanced/);
  assert.match(filters,/All classes in grade/);
  assert.doesNotMatch(filters,/All grades/);
  assert.doesNotMatch(filters,/Group By|Promotion Subjects|Active Subjects|Show Progression Code/);
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
  assert.match(actions,/p_actor_user_id:\s*context\.user\.id/);
});

test("legacy issued snapshots normalize missing source-fidelity fields before print or XLSX rendering",()=>{
  assert.ok(server.includes("normalizeFrozenAcademicSchedulePayload"));
  assert.ok(server.includes('raw.period==="all_terms"||scheduleType==="promotion_all_terms"'));
  assert.ok(server.includes("classNames=Array.isArray(raw.classNames)"));
  assert.ok(server.includes("classIds=Array.isArray(raw.classIds)"));
  assert.ok(server.includes("scopeKey:typeof raw.scopeKey"));
  assert.ok(printPage.includes("(payload.classNames??[]).join"));
  assert.match(xlsx,/\(payload\.classNames\s*\?\?\s*\[\]\)\.join/);
  assert.ok(xlsx.includes("payload.periodLabel"));
  assert.ok(xlsx.includes("buildOfficialDocumentWorkbookSheet"));
  assert.ok(xlsx.includes("finalizeOfficialDocumentWorkbook"));
});

test("legacy analytical schedule redirects preserve historical scope",()=>{
  assert.ok(page.includes('bridge.set("basis",params.basis)'));
  assert.ok(page.includes('bridge.set("grade",params.grade)'));
  assert.ok(page.includes('bridge.set("class",params.class)'));
  assert.ok(exportRoute.includes('["year","term","basis","grade","class"]'));
  assert.ok(printPage.includes('basis:params.basis??"official"'));
  assert.ok(printPage.includes('bridge.set("grade",params.grade)'));
  assert.ok(printPage.includes('bridge.set("class",params.class)'));
});

test("required grade scope is protected by the canonical one-offering-per-subject invariant",()=>{
  assert.ok(server.includes('.eq("grade_id",input.gradeId)'));
  assert.ok(timetableFoundation.includes("unique (school_id, academic_year, subject_id, grade_id)"));
});

test("direct print and XLSX routes canonicalize legacy grade and class references and fail closed",()=>{
  assert.ok(printPage.includes("row.value===params.grade||row.label===params.grade||row.code===params.grade"));
  assert.ok(printPage.includes("rawClassScope.map"));
  assert.ok(printPage.includes("notFound()"));
  assert.ok(exportRoute.includes("row.value===gradeRef||row.label===gradeRef||row.code===gradeRef"));
  assert.ok(exportRoute.includes("Invalid academic schedule grade scope."));
  assert.ok(exportRoute.includes("Invalid academic schedule class scope."));
});

test("provisional schedules do not mix official progression rulings and finalization requires canonical structure",()=>{
  assert.ok(server.includes('input.basis==="official"&&gradeEnrolmentIds.length'));
  assert.ok(server.includes('{label:"Academic terms"'));
  assert.ok(server.includes('"Subjects",status:subjects.length?"available":"unavailable"'));
  assert.ok(actions.includes('["Academic terms","Learner roster","Subjects"]'));
  assert.ok(actions.includes("Cannot finalize until governed "));
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
  assert.match(actions,/try\s*\{/);
  assert.match(actions,/catch\s*\{/);
  assert.match(actions,/Unable to finalize the academic schedule from canonical academic data/);
  assert.match(finalizeForm,/useActionState/);
  assert.match(finalizeForm,/useFormStatus/);
  assert.match(finalizeForm,/Finalizing…/);
  assert.match(finalizeForm,/role="status"/);
});

test("document print surfaces share governed chrome, safe navigation and deterministic schedule density",()=>{
  assert.match(analysisPrintPage,/OFFICIAL_DOCUMENT_HTML_HEADER_RULE/);
  assert.match(analysisPrintPage,/renderOfficialDocumentHtmlHeader/);
  assert.match(analysisPrintPage,/DocumentBackLink/);
  assert.doesNotMatch(analysisPrintPage,/header\.logoUrl \? <img/);

  assert.match(printPage,/DocumentBackLink/);
  assert.match(printPage,/table-layout:fixed/);
  assert.match(printPage,/metric-heading/);
  assert.match(printPage,/subject-heading/);
  assert.match(printPage,/columnLayout\.map/);
  assert.match(printPage,/academicScheduleColumnKind/);
  assert.match(printPage,/academicScheduleColumnWidth/);

  assert.match(scheduleColumnLayout,/IDENTITY_COLUMNS/);
  assert.match(scheduleColumnLayout,/METRIC_WIDTHS/);
  assert.match(scheduleColumnLayout,/kind === "subject"/);
  assert.match(xlsx,/academicScheduleColumnWidth/);

  assert.match(globals,/\[data-sonner-toaster\]/);
  assert.match(globals,/\.scolapro-screen-only/);
  assert.match(documentActions,/target="_blank"/);
  assert.match(documentActions,/rel="noopener noreferrer"/);
});
