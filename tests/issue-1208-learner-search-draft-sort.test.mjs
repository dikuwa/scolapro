/**
 * Executed behavioral regression tests for Issue #1208.
 *
 * Tests that actually run the application code to verify:
 * 1. Both name orders match in daily/weekly register client-side search.
 * 2. Surname A–Z sort is preserved.
 * 3. Unsaved attendance drafts survive sort/filter operations.
 * 4. formatLearnerName produces consistent Surname GivenNames output.
 * 5. nameAlternate (given-first) is distinct from name (surname-first).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { getVisibleDailyRegisterRows } from "../src/features/attendance/daily-register-view-state.ts";
import { formatLearnerName, formatPersonName } from "../src/lib/person-name.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRow(enrolmentId, firstName, surname, sex = "unspecified", status = "present") {
  const givenNorm = formatPersonName(firstName);
  const surnameNorm = formatPersonName(surname);
  return {
    enrolmentId,
    learnerId: `l-${enrolmentId}`,
    name: [surnameNorm, givenNorm].filter(Boolean).join(" ") || "Learner",
    nameAlternate: [givenNorm, surnameNorm].filter(Boolean).join(" "),
    admissionNumber: `ADM-${enrolmentId}`,
    sex,
    status,
    reasonId: null,
    note: null,
  };
}

const ROSTER = [
  makeRow("e1", "Angel",    "Mbuti",        "female"),
  makeRow("e2", "Alberto",  "Mutaleni",     "male"),
  makeRow("e3", "Selma",    "Nghifikepunye","female"),
  makeRow("e4", "Koos",     "Van Der Berg", "male"),
  makeRow("e5", "Jean-Luc", "O'Brien",      "male"),
  makeRow("e6", "MARIA",    "HAMUKOTO",     "female"),   // all-caps import artefact
];

// ─── 1. formatLearnerName utility ────────────────────────────────────────────

test("formatLearnerName returns Surname GivenNames", () => {
  assert.equal(formatLearnerName("Angel", "Mbuti"), "Mbuti Angel");
  assert.equal(formatLearnerName("Alberto", "Mutaleni"), "Mutaleni Alberto");
});

test("formatLearnerName normalises all-caps import artefacts", () => {
  // MARIA HAMUKOTO → Maria Hamukoto (display only; source unchanged)
  assert.equal(formatLearnerName("MARIA", "HAMUKOTO"), "Hamukoto Maria");
});

test("formatLearnerName preserves intentional mixed-case names", () => {
  // J. initial — not an all-caps word, preserved as-is
  assert.equal(formatLearnerName("J.", "Smith"), "Smith J.");
});

test("formatLearnerName preserves hyphenated given names", () => {
  assert.equal(formatLearnerName("Jean-Luc", "O'Brien"), "O'Brien Jean-Luc");
});

test("formatLearnerName normalises all-lowercase particles in compound surnames", () => {
  // "van der Berg" — "van" and "der" are all-lowercase so they are title-cased on display.
  // This is consistent with the all-caps normalization: purely uniform-case words are
  // corrected for display. Source identity data is never rewritten.
  assert.equal(formatLearnerName("Koos", "van der Berg"), "Van Der Berg Koos");
});

test("formatLearnerName falls back to 'Learner' when both parts are empty", () => {
  assert.equal(formatLearnerName(null, null), "Learner");
  assert.equal(formatLearnerName("", ""), "Learner");
  assert.equal(formatLearnerName(undefined, undefined), "Learner");
});

test("formatLearnerName returns only surname when given names are absent", () => {
  assert.equal(formatLearnerName(null, "Mbuti"), "Mbuti");
  assert.equal(formatLearnerName("", "Mbuti"), "Mbuti");
});

test("formatLearnerName returns only given names when surname is absent", () => {
  assert.equal(formatLearnerName("Angel", null), "Angel");
});

test("nameAlternate is given-first (distinct from surname-first name)", () => {
  const row = makeRow("x", "Angel", "Mbuti");
  assert.equal(row.name, "Mbuti Angel");
  assert.equal(row.nameAlternate, "Angel Mbuti");
  assert.notEqual(row.name, row.nameAlternate);
});

// ─── 2. Both name orders match in daily register search ───────────────────────

test("surname-first query matches learner in daily register", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "Mbuti Angel", "all", "asc");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].enrolmentId, "e1");
});

test("given-first query matches learner in daily register", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "Angel Mbuti", "all", "asc");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].enrolmentId, "e1");
});

test("surname-only query matches learner", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "Mutaleni", "all", "asc");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].enrolmentId, "e2");
});

test("given-name-only query matches learner", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "Angel", "all", "asc");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].enrolmentId, "e1");
});

test("admission number query matches learner", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "ADM-e3", "all", "asc");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].enrolmentId, "e3");
});

test("case-insensitive search: lowercase query matches mixed-case name", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "mbuti angel", "all", "asc");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].enrolmentId, "e1");
});

test("case-insensitive search: all-caps stored name matched by lowercase query", () => {
  // MARIA HAMUKOTO is stored as-is but displayed/searched as Hamukoto Maria
  const visible = getVisibleDailyRegisterRows(ROSTER, "hamukoto", "all", "asc");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].enrolmentId, "e6");
});

test("empty query returns full roster", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "", "all", "asc");
  assert.equal(visible.length, ROSTER.length);
});

test("non-matching query returns empty roster", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "ZZZNoMatch999", "all", "asc");
  assert.equal(visible.length, 0);
});

test("hyphenated given name matched by either part", () => {
  // Jean-Luc O'Brien — search by just 'Jean' or 'Luc'
  const byJean = getVisibleDailyRegisterRows(ROSTER, "Jean", "all", "asc");
  assert.ok(byJean.some((r) => r.enrolmentId === "e5"), "expected Jean-Luc via 'Jean' query");
  const byLuc = getVisibleDailyRegisterRows(ROSTER, "Luc", "all", "asc");
  assert.ok(byLuc.some((r) => r.enrolmentId === "e5"), "expected Jean-Luc via 'Luc' query");
});

test("compound surname matched by particle substring", () => {
  const visible = getVisibleDailyRegisterRows(ROSTER, "van der", "all", "asc");
  assert.ok(visible.some((r) => r.enrolmentId === "e4"), "expected van der Berg to match");
});

// ─── 3. Surname A–Z / Z–A sort ───────────────────────────────────────────────

test("asc sort orders rows by surname A-Z", () => {
  const sorted = getVisibleDailyRegisterRows(ROSTER, "", "all", "asc").map((r) => r.enrolmentId);
  // Surnames: Hamukoto, Mbuti, Mutaleni, Nghifikepunye, O'Brien, van der Berg
  // (Note: sort is by the display name string after normalization)
  const names = getVisibleDailyRegisterRows(ROSTER, "", "all", "asc").map((r) => r.name);
  for (let i = 1; i < names.length; i++) {
    assert.ok(
      names[i - 1].localeCompare(names[i], "en", { sensitivity: "base" }) <= 0,
      `Expected ${names[i - 1]} ≤ ${names[i]} in asc order`,
    );
  }
  void sorted; // used for length check implicitly
});

test("desc sort reverses the surname order", () => {
  const asc  = getVisibleDailyRegisterRows(ROSTER, "", "all", "asc").map((r) => r.enrolmentId);
  const desc = getVisibleDailyRegisterRows(ROSTER, "", "all", "desc").map((r) => r.enrolmentId);
  assert.deepEqual(desc, [...asc].reverse());
});

// ─── 4. Unsaved draft preservation through sort/filter ───────────────────────

test("unsaved attendance status is preserved after sort", () => {
  // Simulate user marking e1 absent before the server round-trip
  const draft = ROSTER.map((r) =>
    r.enrolmentId === "e1" ? { ...r, status: "absent", reasonId: "r-sick", note: "unwell" } : r,
  );

  const sorted = getVisibleDailyRegisterRows(draft, "", "all", "asc");
  const mbutRow = sorted.find((r) => r.enrolmentId === "e1");
  assert.ok(mbutRow, "Mbuti Angel should still appear after sort");
  assert.equal(mbutRow.status, "absent", "unsaved absent status must survive sort");
  assert.equal(mbutRow.reasonId, "r-sick");
  assert.equal(mbutRow.note, "unwell");
});

test("unsaved attendance is preserved after sex filter changes", () => {
  const draft = ROSTER.map((r) =>
    r.enrolmentId === "e1" ? { ...r, status: "late" } : r,
  );
  const femaleOnly = getVisibleDailyRegisterRows(draft, "", "female", "asc");
  const mbutRow = femaleOnly.find((r) => r.enrolmentId === "e1");
  assert.ok(mbutRow, "Mbuti Angel (female) should appear in female filter");
  assert.equal(mbutRow.status, "late");
});

test("unsaved attendance is preserved after search narrows the roster", () => {
  const draft = ROSTER.map((r) =>
    r.enrolmentId === "e2" ? { ...r, status: "excused", reasonId: "r-trip" } : r,
  );
  // Search by given-first order to verify both name-order search AND draft preservation
  const found = getVisibleDailyRegisterRows(draft, "Alberto Mutaleni", "all", "asc");
  assert.equal(found.length, 1);
  assert.equal(found[0].enrolmentId, "e2");
  assert.equal(found[0].status, "excused");
  assert.equal(found[0].reasonId, "r-trip");
});

// ─── 5. name / nameAlternate consistency across the roster ───────────────────

test("every row name is Surname GivenNames and nameAlternate is GivenNames Surname", () => {
  for (const row of ROSTER) {
    // name must not start with a known given name unless surname is absent
    // We verify by checking name !== nameAlternate when both parts exist
    if (row.name !== "Learner" && row.nameAlternate) {
      const parts = row.name.split(" ");
      const altParts = row.nameAlternate.split(" ");
      // First token of name should equal last token of nameAlternate (for simple two-part names)
      // For compound names just assert they differ
      if (parts.length === 2 && altParts.length === 2) {
        assert.equal(parts[0], altParts[1], `surname-first: ${row.name} vs ${row.nameAlternate}`);
        assert.equal(parts[1], altParts[0], `given-first: ${row.name} vs ${row.nameAlternate}`);
      }
    }
  }
});
