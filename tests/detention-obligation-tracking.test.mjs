import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const historyQueries = await read("src/features/late-arrivals/server/detention-history-queries.ts");
const historyPage = await read("src/app/late-arrivals/history/page.tsx");
const historyView = await read("src/features/late-arrivals/detention-history-view.tsx");
const lateArrivalsPage = await read("src/app/late-arrivals/page.tsx");
const lateWorkspace = await read("src/features/late-arrivals/late-arrival-workspace.tsx");

test("detention tracking reuses canonical obligation read models with lifecycle filtering", () => {
  assert.match(historyQueries, /list_detention_obligation_tracking/);
  assert.match(historyQueries, /get_detention_obligation_summary/);
  assert.match(historyQueries, /p_lifecycle: lifecycle/);
  assert.match(historyQueries, /missedSessionCount/);
  assert.match(historyQueries, /learnerOutstandingCount/);
});

test("history route uses deterministic current-school context", () => {
  assert.match(historyPage, /context\.currentSchoolMembership/);
  assert.doesNotMatch(historyPage, /context\.memberships\.find/);
  assert.match(historyPage, /lifecycle/);
});

test("detention lifecycle UI exposes outstanding, overdue, partial, completed and missed states", () => {
  for (const label of ["Outstanding", "Overdue", "Partially fulfilled", "Completed"]) {
    assert.match(historyView, new RegExp(label));
  }
  assert.match(historyView, /Missed detention/);
  assert.match(historyView, /Multiple outstanding/);
  assert.match(historyView, /currently enrolled|No longer currently enrolled/i);
});

test("late-arrival UI does not hard-code detention threshold or Friday cycle copy", () => {
  assert.doesNotMatch(lateArrivalsPage, /Friday detention/);
  assert.doesNotMatch(lateWorkspace, /Every three cumulative late arrivals/);
  assert.doesNotMatch(lateWorkspace, /next Friday/);
  assert.match(lateWorkspace, /configured threshold/);
  assert.match(lateWorkspace, /configured detention cycle/);
});
