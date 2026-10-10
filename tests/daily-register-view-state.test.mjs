import assert from "node:assert/strict";
import test from "node:test";

import { getDailyRegisterExceptions, getVisibleDailyRegisterRows } from "../src/features/attendance/daily-register-view-state.ts";

// Learner factory — names now follow Surname GivenNames policy (#1208).
// nameAlternate carries the GivenNames Surname order for both-order search.
const learner = (enrolmentId, name, nameAlternate, sex) => ({
  enrolmentId,
  learnerId: `learner-${enrolmentId}`,
  name,
  nameAlternate,
  admissionNumber: enrolmentId,
  sex,
  status: "present",
  reasonId: null,
  note: null,
});

test("sort and sex filters preserve unsaved attendance edits through submission", () => {
  let draftRows = [
    learner("003", "Ndeitunga Zelda",  "Zelda Ndeitunga",  "female"),
    learner("001", "Amutenya Andreas", "Andreas Amutenya", "male"),
    learner("002", "Hamukoto Maria",   "Maria Hamukoto",   "female"),
  ];

  draftRows = draftRows.map((row) => row.enrolmentId === "001"
    ? { ...row, status: "absent", reasonId: "reason-sick", note: "Clinic letter pending" }
    : row);
  draftRows = draftRows.map((row) => row.enrolmentId === "002"
    ? { ...row, status: "late", reasonId: "reason-transport", note: "Bus delay" }
    : row);

  assert.deepEqual(
    getVisibleDailyRegisterRows(draftRows, "", "all", "desc").map((row) => row.name),
    ["Ndeitunga Zelda", "Hamukoto Maria", "Amutenya Andreas"],
  );
  assert.deepEqual(
    getVisibleDailyRegisterRows(draftRows, "", "female", "desc").map((row) => [row.enrolmentId, row.status, row.reasonId]),
    [["003", "present", null], ["002", "late", "reason-transport"]],
  );
  assert.deepEqual(
    getVisibleDailyRegisterRows(draftRows, "", "male", "asc").map((row) => [row.enrolmentId, row.status, row.reasonId]),
    [["001", "absent", "reason-sick"]],
  );
  assert.deepEqual(
    getVisibleDailyRegisterRows(draftRows, "", "all", "asc").map((row) => [row.enrolmentId, row.status, row.reasonId]),
    [
      ["001", "absent", "reason-sick"],
      ["002", "late", "reason-transport"],
      ["003", "present", null],
    ],
  );

  assert.deepEqual(getDailyRegisterExceptions(draftRows), [
    {
      enrolment_id: "001",
      status: "absent",
      reason_id: "reason-sick",
      note: "Clinic letter pending",
    },
    {
      enrolment_id: "002",
      status: "late",
      reason_id: "reason-transport",
      note: "Bus delay",
    },
  ]);
});
