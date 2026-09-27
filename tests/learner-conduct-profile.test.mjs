import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("src/features/conduct/learner-conduct-profile.tsx","utf8");
const route = readFileSync("src/app/conduct/learners/[learnerId]/page.tsx","utf8");
const learner = readFileSync("src/app/learners/[id]/page.tsx","utf8");

test("learner conduct profile is balanced and summary first", () => {
  for (const token of ["Recognitions","Violations","Recognition points","Violation points","Net points","Term comparison","Recognition breakdown","Violation breakdown","Conduct timeline"]) assert.match(profile,new RegExp(token));
});

test("learner profile avoids automatic good bad conduct labels", () => {
  assert.match(profile,/does not classify learners as good, bad or poor conduct/);
  assert.doesNotMatch(profile,/Good conduct score|Bad conduct score|Poor conduct score/);
});

test("term comparison uses governed academic year context", () => {
  assert.match(route,/getGovernedAcademicYear/);
  assert.match(profile,/governed school term dates only/);
});

test("conduct timeline includes actor and note with pagination", () => {
  assert.match(profile,/Recorded by/);
  assert.match(profile,/event\.note/);
  assert.match(profile,/profile\.hasMore/);
  assert.match(profile,/Previous/);
  assert.match(profile,/Next/);
});

test("learner overview links to the dedicated conduct profile", () => {
  assert.match(learner,/\/conduct\/learners\/\$\{learner\.id\}/);
  assert.match(learner,/Open conduct profile/);
});
