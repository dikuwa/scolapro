import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tabs = readFileSync("src/features/attendance/attendance-view-tabs.tsx", "utf8");

test("attendance view tabs fit the mobile content width without changing desktop treatment", () => {
  assert.match(tabs, /flex min-h-10 w-full max-w-full items-center/);
  assert.match(tabs, /sm:inline-flex sm:w-fit/);
  assert.match(tabs, /min-w-0 flex-1/);
  assert.match(tabs, /px-2 text-xs/);
  assert.match(tabs, /sm:flex-none sm:px-3/);
  assert.match(tabs, /hidden size-3\.5 sm:block/);
});

test("attendance view tab routing contract is unchanged", () => {
  assert.match(tabs, /view: "day" \| "week" \| "official" \| "absences"/);
  assert.match(tabs, /router\.replace\(`\/attendance\?\$\{params\.toString\(\)\}`/);
  assert.match(tabs, /params\.set\("date", nextView === "week" \|\| nextView === "official" \? weekDate : date\)/);
});
