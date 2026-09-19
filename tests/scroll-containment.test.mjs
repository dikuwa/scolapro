import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardianDirectory = await readFile(
  new URL("../src/features/guardians/guardian-directory.tsx", import.meta.url),
  "utf8",
);
const lateArrivalWorkspace = await readFile(
  new URL("../src/features/late-arrivals/late-arrival-workspace.tsx", import.meta.url),
  "utf8",
);

const boundedScrollClasses =
  /max-h-\[min\(62vh,42rem\)\][^"]*overflow-x-hidden[^"]*overflow-y-auto[^"]*overscroll-contain[^"]*scolapro-scrollbar/;

test("guardian directory bounds only the result region and keeps filters outside it", () => {
  assert.match(guardianDirectory, boundedScrollClasses);
  const resultsStart = guardianDirectory.indexOf('aria-label="Guardian directory results"');
  assert.notEqual(resultsStart, -1);
  assert.ok(
    guardianDirectory.indexOf("Search guardian by name", resultsStart) === -1,
    "guardian filters must remain outside the bounded result region",
  );
  assert.match(guardianDirectory, /expandedGuardianId/);
  assert.match(guardianDirectory, /aria-expanded=\{expanded\}/);
});

test("late-arrival bulk learner results use bounded native scrolling without changing selection controls", () => {
  assert.match(lateArrivalWorkspace, boundedScrollClasses);
  const eligibleStart = lateArrivalWorkspace.indexOf("Eligible learners in");
  const resultStart = lateArrivalWorkspace.indexOf("max-h-[min(62vh,42rem)]", eligibleStart);
  assert.notEqual(eligibleStart, -1);
  assert.notEqual(resultStart, -1);
  assert.ok(
    lateArrivalWorkspace.indexOf("Select all", resultStart) === -1,
    "select-all control must remain in the visible learner-list header",
  );
  assert.match(lateArrivalWorkspace, /onClick=\{toggleSelectAllBulk\}/);
  assert.match(lateArrivalWorkspace, /onClick=\{\(\) => toggleBulkId\(learner\.enrolmentId\)\}/);
  assert.match(lateArrivalWorkspace, /selectedBulkIds\.includes\(learner\.enrolmentId\)/);
  assert.match(lateArrivalWorkspace, /scroll-m-2/);
});