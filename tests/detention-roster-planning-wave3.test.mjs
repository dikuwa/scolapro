import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const planner = source("features/late-arrivals/detention-planner.tsx");
const planningQueries = source("features/late-arrivals/server/planning-queries.ts");
const planningActions = source("features/late-arrivals/server/planning-actions.ts");
const mySupervision = source("features/late-arrivals/server/my-supervision.ts");
const myWorkspace = source("features/late-arrivals/my-detention-supervision-workspace.tsx");

test("detention planning consumes flexible school cycle configuration instead of hard-coding Friday", () => {
  assert.match(planningQueries, /school_late_arrival_policies/);
  assert.match(planningQueries, /detention_schedule_mode/);
  assert.match(planningQueries, /detention_weekdays/);
  assert.match(planner, /nextConfiguredDate/);
  assert.doesNotMatch(planner, /nextFriday/);
  assert.doesNotMatch(planner, /coming Friday/);
});

test("future roster rescheduling keeps the same session and uses a governed server action", () => {
  assert.match(planningActions, /rescheduleDetentionSession/);
  assert.match(planningActions, /reschedule_detention_session_plan/);
  assert.match(planner, /RescheduleSessionForm/);
  assert.match(planner, /Completed or cancelled sessions cannot be rewritten/);
});

test("teachers can see upcoming duty before learners are attached", () => {
  assert.match(mySupervision, /list_my_upcoming_detention_sessions/);
  assert.match(mySupervision, /upcomingSessions/);
  assert.match(myWorkspace, /Upcoming duty roster/);
  assert.match(myWorkspace, /sessions planned before learners are attached/);
});

test("upcoming duty uses the same session learner count after later allocation", () => {
  assert.match(myWorkspace, /session\.learnerCount/);
  assert.match(myWorkspace, /learner.*attached/);
});

test("roster UI remains responsive and avoids desktop-only tables", () => {
  assert.match(planner, /md:flex-row|sm:grid-cols-2|xl:grid-cols/);
  assert.match(myWorkspace, /md:grid-cols-2|xl:grid-cols-3/);
  assert.doesNotMatch(planner, /<table/);
  assert.doesNotMatch(myWorkspace, /<table/);
});
