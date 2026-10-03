import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync("supabase/migrations/20261003073500_assessment_quality_readiness.sql","utf8");
const server=readFileSync("src/features/assessment/server/quality-readiness.ts","utf8");
const component=readFileSync("src/features/assessment/assessment-quality-workspace.tsx","utf8");
const page=readFileSync("src/app/assessment/quality/page.tsx","utf8");
const assessmentPage=readFileSync("src/app/assessment/page.tsx","utf8");

test("quality analysis derives from canonical assessment evidence only",()=>{
  assert.match(migration,/assessment_instances/);
  assert.match(migration,/assessment_schemes/);
  assert.match(migration,/assessment_components/);
  assert.match(migration,/learner_marks_current/);
  assert.match(migration,/learner_subject_registered_on/);
  assert.match(migration,/mark_enrolment\.id=mark\.enrolment_id/);
  assert.match(migration,/mark_enrolment\.register_class_id=s\.register_class_id/);
  assert.doesNotMatch(migration,/create table .*quality/i);
  assert.doesNotMatch(migration,/teacher_score|teacher_rank/i);
});

test("component indicators cover average median high low completion and missing",()=>{
  assert.match(migration,/average_percent/);
  assert.match(migration,/percentile_cont\(0\.5\)/);
  assert.match(migration,/high_percent/);
  assert.match(migration,/low_percent/);
  assert.match(migration,/completion_percent/);
  assert.match(migration,/missing_required_records/);
});

test("CA exam comparison is descriptive and scheme-aware",()=>{
  assert.match(migration,/exam_paper/);
  assert.match(migration,/exam_total/);
  assert.match(server,/weightedCategoryAverage/);
  assert.match(server,/examMinusCa/);
  assert.match(component,/Descriptive percentage-point gaps only/);
  assert.match(component,/do not score, rank or accuse teachers/);
});

test("final-result-only schemes explicitly suppress component analytics",()=>{
  assert.match(migration,/final_result_only/);
  assert.match(component,/Component analysis not applicable/);
  assert.match(component,/component average\/median\/high\/low is intentionally not calculated/);
});

test("readiness reuses existing moderation lifecycle",()=>{
  for(const status of ["draft","submitted","returned","verified","locked"]) assert.match(migration,new RegExp(`'${status}'`));
  assert.match(component,/Moderation required/);
  assert.match(component,/Standard review/);
});

test("context scope is school leadership, HOD portfolio or canonical teacher allocation",()=>{
  assert.match(migration,/hod_responsible_for_subject/);
  assert.match(migration,/membership\.staff_member_id=ta\.staff_member_id/);
  assert.match(server,/Department portfolio/);
  assert.match(server,/My teaching allocations/);
  assert.match(component,/All subjects/);
  assert.match(component,/All classes/);
  assert.match(component,/All teachers/);
});

test("quality workspace lives under Assessment rather than Academic Analysis",()=>{
  assert.match(page,/Assessment quality & readiness/);
  assert.match(assessmentPage,/assessment\/quality/);
  assert.doesNotMatch(page,/academics\/analysis/);
});
