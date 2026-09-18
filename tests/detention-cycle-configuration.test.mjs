import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const planner = source("features/late-arrivals/detention-planner.tsx");
const planningQueries = source("features/late-arrivals/server/planning-queries.ts");
const planningActions = source("features/late-arrivals/server/planning-actions.ts");
const lateArrivalsPage = source("app/late-arrivals/page.tsx");

test("detention cycle supports one or many configured weekdays plus manual scheduling", () => {
  assert.match(planningQueries, /detention_schedule_mode/);
  assert.match(planningQueries, /detention_weekdays/);
  assert.match(planner, /Configured days/);
  assert.match(planner, /Manual \/ ad-hoc/);
  assert.match(planner, /WEEKDAY_NAMES\.map/);
  assert.match(planner, /grid-cols-2/);
  assert.match(planner, /sm:grid-cols-4/);
  assert.match(planner, /lg:grid-cols-7/);
});

test("detention cycle configuration uses a governed server action", () => {
  assert.match(planningActions, /updateDetentionCycleConfiguration/);
  assert.match(planningActions, /update_detention_cycle_configuration/);
  assert.match(planningActions, /Only current-school leadership can change detention scheduling/);
  assert.match(lateArrivalsPage, /canConfigureCycle=\{leadership\}/);
});

test("manual mode still uses the same authorised future detention session planner", () => {
  assert.match(planner, /Manual\/ad-hoc scheduling is active/);
  assert.match(planner, /authorised future roster date/);
  assert.match(planningActions, /create_detention_session_plan/);
  assert.doesNotMatch(planner, /Friday detention|coming Friday/);
});

test("configured days are defaults rather than a hard restriction on authorised manual dates", () => {
  assert.match(planner, /nextConfiguredDate/);
  assert.match(planner, /authorised manual future dates remain available/);
  assert.match(planner, /DateField label="Detention date"/);
});
