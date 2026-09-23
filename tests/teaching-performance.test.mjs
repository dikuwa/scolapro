import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/teaching/server/queries.ts", "utf8");

test("teaching workspace starts independent top-level reads together", () => {
  assert.match(source, /const \[calendar, allocationsResult, plans, dayOverrideRows\] = await Promise\.all/);
  assert.doesNotMatch(source, /const calendar = await getSchoolCalendar/);
  assert.doesNotMatch(source, /const allocationsResult = await supabase/);
});

test("teaching schedule and curriculum registry reads share one request wave", () => {
  assert.match(source, /const \[scheduleRows, objectiveRows, competencyRows, eventRows\] = await Promise\.all/);
});

test("preparation and actual teaching reads share one request wave", () => {
  assert.match(source, /const \[preparationRows, actualRows\] = await Promise\.all/);
});
