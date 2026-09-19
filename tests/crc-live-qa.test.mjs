import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const cumulativePage = read("src/app/learners/[id]/cumulative-record/page.tsx");
const cumulativeError = read("src/app/learners/[id]/cumulative-record/error.tsx");
const custodyPage = read("src/app/school/crc-custody/page.tsx");
const custodyLoading = read("src/app/school/crc-custody/loading.tsx");
const custodyError = read("src/app/school/crc-custody/error.tsx");
const custodyWorkspace = read("src/features/crc/crc-custody-workspace.tsx");
const cumulativeQueries = read("src/features/learners/server/cumulative-record.ts");

test("CRC canonical routes retain explicit loading, empty and error states", () => {
  assert.match(cumulativeError, /Cumulative record could not be loaded/);
  assert.match(custodyLoading, /Loading CRC custody/);
  assert.match(custodyLoading, /RouteLoadingIndicator/);
  assert.match(custodyError, /CRC custody could not load/);
  assert.match(custodyError, /No custody record, document or lifecycle state was changed/);
  assert.match(custodyWorkspace, /No custody records in your scope/);
});

test("cumulative record stays on authoritative role-scoped read paths", () => {
  assert.match(cumulativePage, /getLearnerOverview\(id, membership\.schoolId\)/);
  assert.match(cumulativePage, /getLearnerCumulativeRecord\(id, membership\.schoolId\)/);
  assert.match(cumulativeQueries, /learner_health_history/);
  assert.match(cumulativeQueries, /learner_psychometric_records/);
  assert.match(cumulativeQueries, /learner_development_observations/);
  assert.match(cumulativeQueries, /learner_cumulative_notes/);
  assert.match(cumulativeQueries, /RLS intentionally makes restricted collections look empty/);
});

test("CRC custody UI preserves support versus leadership responsibilities", () => {
  assert.match(custodyPage, /counsellor/);
  assert.match(custodyPage, /learner_support/);
  assert.match(custodyPage, /social_worker/);
  assert.match(custodyPage, /school_admin/);
  assert.match(custodyPage, /principal/);
  assert.match(custodyPage, /deputy_principal/);
  assert.doesNotMatch(custodyPage, /["']teacher["']/);
  assert.doesNotMatch(custodyPage, /["']hod["']/);
});

test("CRC custody source remains responsive from phone through desktop breakpoints", () => {
  assert.match(custodyPage, /sm:grid-cols-2/);
  assert.match(custodyWorkspace, /sm:flex-row/);
  assert.match(custodyWorkspace, /xl:grid-cols-/);
  assert.match(cumulativePage, /sm:flex-row/);
  assert.match(cumulativePage, /xl:grid-cols-2/);
});
