import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

const queries=read("src/features/learners/server/queries.ts");
const directoryPage=read("src/app/learners/page.tsx");
const detailPage=read("src/app/learners/[id]/page.tsx");
const directory=read("src/features/learners/learner-directory.tsx");
const listLoading=read("src/app/learners/loading.tsx");
const listError=read("src/app/learners/error.tsx");
const detailLoading=read("src/app/learners/[id]/loading.tsx");
const detailError=read("src/app/learners/[id]/error.tsx");

test("learner overview fails closed without an effective current enrolment",()=>{
  const start=queries.indexOf("export async function getLearnerOverview");
  const body=queries.slice(start);
  assert.match(body,/row\.status === "current"/);
  assert.match(body,/row\.enrolled_from <= today/);
  assert.match(body,/!row\.enrolled_to \|\| row\.enrolled_to >= today/);
  assert.match(body,/if \(!data\) return null/);
  assert.doesNotMatch(body,/latestStarted/);
  assert.doesNotMatch(body,/effectiveCurrent \?\? latestStarted/);
});

test("learner routes expose loading empty and explicit error states",()=>{
  assert.match(listLoading,/Loading learners/);
  assert.match(listLoading,/RouteLoadingIndicator/);
  assert.match(listError,/Learner directory could not load/);
  assert.match(detailLoading,/Loading learner overview/);
  assert.match(detailError,/Learner overview could not load/);
  assert.match(detailPage,/if \(!learner\) notFound\(\)/);
  assert.match(directory,/No learners|No learner|No matching/i);
});

test("learner directory keeps the canonical page read independent from auxiliary filter options",()=>{
  assert.match(directoryPage,/Promise\.allSettled/);
  assert.match(directoryPage,/directoryResult\.status === "rejected"/);
  assert.match(directoryPage,/academicOptionsResult\.status === "fulfilled"/);
  assert.match(directoryPage,/academicOptions = academicOptionsResult\.status === "fulfilled" \? academicOptionsResult\.value : \[\]/);
  assert.doesNotMatch(directoryPage,/academicOptionsResult\.status === "rejected"[\s\S]{0,180}throw/);
});

test("generic learner detail remains operational-scope only and does not query restricted support or exam stores",()=>{
  assert.match(detailPage,/getLearnerOverview\(id, membership\.schoolId\)/);
  assert.doesNotMatch(queries,/learner_support_cases|psychometric|exam_access|examination_access|restricted_access/);
  assert.doesNotMatch(detailPage,/learner_support_cases|psychometric|exam_access|examination_access|restricted_access/);
});

test("learner directory and detail retain responsive phone tablet desktop source breakpoints",()=>{
  assert.match(directoryPage,/sm:flex-row/);
  assert.match(directory,/sm:max-w-lg/);
  assert.match(directory,/xl:grid-cols-/);
  assert.match(detailPage,/sm:flex-row/);
  assert.match(detailPage,/sm:grid-cols-2/);
  assert.match(detailPage,/xl:grid-cols-/);
});
