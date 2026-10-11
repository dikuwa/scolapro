/**
 * Executed regression tests for Issue #1218.
 *
 * 1. The weekly register exposes the same surname A–Z / Z–A ordering as the
 *    daily register, via the shared `sortRegisterRowsBySurname` projection.
 * 2. Sorting is a pure view projection: unsaved draft edits survive it and the
 *    submit payload is still built from the unsorted draft rows.
 * 3. The chosen order is carried through week/class navigation and the initial
 *    URL `sort` parameter, so the roster never silently re-sorts.
 * 4. `CloseAction` defaults to the light `danger-soft` dismiss treatment while
 *    full-strength destructive styling stays reserved for real commits.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getVisibleDailyRegisterRows,
  sortRegisterRowsBySurname,
} from "../src/features/attendance/daily-register-view-state.ts";

const read = (path) => readFileSync(path, "utf8");

const row = (enrolmentId, name, admissionNumber = `ADM-${enrolmentId}`, sex = "unspecified") => ({
  enrolmentId,
  learnerId: `learner-${enrolmentId}`,
  name,
  nameAlternate: name.split(" ").reverse().join(" "),
  admissionNumber,
  sex,
  status: "present",
  reasonId: null,
  note: null,
});

const ROSTER = [
  row("003", "Ndeitunga Zelda"),
  row("001", "Amutenya Andreas"),
  row("002", "Hamukoto Maria"),
];

// ─── Shared surname ordering ─────────────────────────────────────────────────

test("weekly and daily registers share one surname A–Z / Z–A ordering", () => {
  assert.deepEqual(
    sortRegisterRowsBySurname(ROSTER, "asc").map((learner) => learner.enrolmentId),
    ["001", "002", "003"],
  );
  assert.deepEqual(
    sortRegisterRowsBySurname(ROSTER, "desc").map((learner) => learner.enrolmentId),
    ["003", "002", "001"],
  );
  assert.deepEqual(
    sortRegisterRowsBySurname(ROSTER, "desc").map((learner) => learner.enrolmentId),
    getVisibleDailyRegisterRows(ROSTER, "", "all", "desc").map((learner) => learner.enrolmentId),
  );
});

test("descending order is the exact reverse of ascending for a tie-free roster", () => {
  const asc = sortRegisterRowsBySurname(ROSTER, "asc").map((learner) => learner.enrolmentId);
  const desc = sortRegisterRowsBySurname(ROSTER, "desc").map((learner) => learner.enrolmentId);
  assert.deepEqual(desc, [...asc].reverse());
});

test("rows that compare equal keep their original server order in both directions", () => {
  const twins = [
    row("a", "Hamukoto Maria", "ADM-77"),
    row("b", "Hamukoto Maria", "ADM-77"),
    row("c", "Amutenya Andreas", "ADM-77"),
  ];
  assert.deepEqual(sortRegisterRowsBySurname(twins, "asc").map((r) => r.enrolmentId), ["c", "a", "b"]);
  assert.deepEqual(sortRegisterRowsBySurname(twins, "desc").map((r) => r.enrolmentId), ["a", "b", "c"]);
});

test("sorting never discards unsaved weekly draft edits", () => {
  const draft = ROSTER.map((learner) => learner.enrolmentId === "001"
    ? { ...learner, status: "absent", reasonId: "reason-sick", note: "Clinic letter pending" }
    : learner);

  const sorted = sortRegisterRowsBySurname(draft, "desc");
  const edited = sorted.find((learner) => learner.enrolmentId === "001");
  assert.ok(edited, "the edited learner must still be present after sorting");
  assert.equal(edited.status, "absent");
  assert.equal(edited.reasonId, "reason-sick");
  assert.equal(edited.note, "Clinic letter pending");
  assert.deepEqual(
    draft.map((learner) => learner.enrolmentId),
    ["003", "001", "002"],
    "the source draft must stay in server order",
  );
});

// ─── Weekly register wiring ──────────────────────────────────────────────────

test("weekly register reuses the shared sort control and surname projection", () => {
  const register = read("src/features/attendance/weekly-register.tsx");
  assert.match(register, /AttendanceSortControl, type AttendanceSortDirection/);
  assert.match(register, /sortRegisterRowsBySurname\(visible, sortDirection\)/);
  assert.match(register, /useState<AttendanceSortDirection>\(initialSort\)/);
  assert.match(register, /initialSort = "asc"/);
  assert.match(register, /<AttendanceSortControl sort=\{sortDirection\} onChange=\{chooseSort\} \/>/);
});

test("weekly sort is display-only and the submit payload uses the draft rows", () => {
  const register = read("src/features/attendance/weekly-register.tsx");
  assert.match(register, /const filteredRows = useMemo\(/);
  assert.match(register, /buildWeeklyAttendancePayload\(\{\s*dates,\s*rows,/);
});

test("weekly sort survives week and class navigation and the initial URL", () => {
  const register = read("src/features/attendance/weekly-register.tsx");
  const page = read("src/app/attendance/page.tsx");
  const control = read("src/features/attendance/attendance-sort-control.tsx");

  // Week and class navigation now build their URL through the shared navigation
  // helper, which carries the chosen order (sort=desc) and sex filter.
  assert.ok((register.match(/buildAttendanceNavigationHref\(\{/g) ?? []).length >= 3);
  assert.match(register, /sort: sortDirection/);
  assert.match(register, /if \(next === "asc"\) url\.searchParams\.delete\("sort"\)/);
  assert.match(register, /url\.searchParams\.set\("sort", "desc"\)/);
  assert.match(page, /initialSort=\{sort\}/);
  assert.match(control, /Learner name order: \$\{sort === "asc" \? "A to Z" : "Z to A"\}/);
});

// ─── Canonical dismiss treatment ─────────────────────────────────────────────

test("close actions default to the light danger-soft dismiss treatment", () => {
  const close = read("src/components/ui/close-action.tsx");
  const button = read("src/components/ui/button.tsx");
  const actions = read("src/components/documents/official-document-actions.tsx");

  assert.match(close, /variant = "danger-soft"/);
  assert.match(close, /variant=\{variant\}/);
  assert.match(button, /"danger-soft":\s*"bg-\[color:var\(--danger-soft\)\]/);
  // The saturated danger fill stays reserved for destructive commits.
  assert.match(button, /danger: "bg-danger-soft text-\[color:var\(--danger\)\] hover:bg-\[color:var\(--danger\)\] hover:text-white"/);
  assert.match(actions, /<CloseAction variant="danger-soft"/);
});

test("full-strength destructive commits keep the saturated danger fill", () => {
  const guard = read("src/components/ui/destructive-action-guard.tsx");
  assert.match(guard, /bg-\[color:var\(--danger\)\] px-3 text-xs font-semibold text-white/);
});
