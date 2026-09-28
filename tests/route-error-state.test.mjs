import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const shared = source("src/components/ui/route-error-state.tsx");

const routeErrors = [
  "src/app/class-lists/error.tsx",
  "src/app/conduct/error.tsx",
  "src/app/dnea/readiness/error.tsx",
  "src/app/learners/[id]/cumulative-record/error.tsx",
  "src/app/learners/[id]/error.tsx",
  "src/app/learners/error.tsx",
  "src/app/library/error.tsx",
  "src/app/school-directory/error.tsx",
  "src/app/school/absence-reviews/error.tsx",
  "src/app/school/contributions/error.tsx",
  "src/app/school/crc-custody/error.tsx",
  "src/app/school/finance/error.tsx",
  "src/app/school/learner-subjects/error.tsx",
  "src/app/school/sports-houses/error.tsx",
  "src/app/staff/error.tsx",
  "src/app/statutory/error.tsx",
  "src/app/teaching/coverage/error.tsx",
  "src/app/teaching/error.tsx",
];

test("shared route error state centers failures in the available viewport", () => {
  assert.match(shared, /grid min-h-\[calc\(100dvh-5rem\)\] place-items-center/);
  assert.match(shared, /w-full max-w-lg/);
  assert.match(shared, /RouteErrorState/);
  assert.match(shared, /Try again/);
});

test("route-level error boundaries use the shared centered error state", () => {
  for (const path of routeErrors) {
    const route = source(path);
    assert.match(route, /RouteErrorState/, path);
  }
});
