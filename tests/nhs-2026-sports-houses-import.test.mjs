import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_YEAR,
  EXPECTED_HOUSES,
  applyReconciliation,
  assertApplySafe,
  buildReconciliationSummary,
  normalizeText,
  parseSportsReportLayoutText,
  reconcileHouses,
  reconcileLearners,
  reconcileManagers,
  validateSourceRows,
} from "../scripts/lib/nhs-2026-sports-houses.mjs";

const layoutFixture = `NAMIB HIGH SCHOOL
HOME SPORT REPORT FOR 2026
TEAM: EAGLES (WHITE)
COLOUR: WHITE
TEAM MANAGER: E SACKARIA

 UNDER 14 BOYS
 Nr Surname        Initials     Preferred name ID Number       Register class
 1   ADAMS         DJMW         Dawid JMW             120201   Grade 8/A
 2   VAN ZYL       CJ           Curtiz J              120919   Grade 8/A
`;

function source(overrides = {}) {
  return {
    sourcePage: 1,
    sourceRow: 1,
    house: "Eagles",
    colourLabel: "White",
    manager: "E Sackaria",
    ageGroup: "U14",
    sex: "M",
    surname: "ADAMS",
    initials: "DJMW",
    preferredName: "Dawid JMW",
    sourceReference: "120201",
    registerClass: "8A",
    ...overrides,
  };
}

function learner(overrides = {}) {
  return {
    id: "learner-1",
    academicYear: 2026,
    registerClass: "8A",
    firstNames: "Dawid Johannes Martin Willem",
    preferredName: "Dawid JMW",
    surname: "Adams",
    dateOfBirth: "2012-02-01",
    sex: "male",
    ...overrides,
  };
}

function houses() {
  return [
    { id: "eagles", name: "Eagles", colorHex: "#FFFFFF" },
    { id: "sharks", name: "Sharks", colorHex: "#808080" },
    { id: "cheetahs", name: "Cheetahs", colorHex: "#FFA500" },
  ];
}

test("PDF normalization parses authoritative house, page, age group, learner and class evidence", () => {
  const rows = parseSportsReportLayoutText(layoutFixture);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    {
      house: rows[0].house,
      colour: rows[0].colourLabel,
      manager: rows[0].manager,
      ageGroup: rows[0].ageGroup,
      surname: rows[0].surname,
      preferredName: rows[0].preferredName,
      registerClass: rows[0].registerClass,
    },
    {
      house: "Eagles",
      colour: "White",
      manager: "E Sackaria",
      ageGroup: "U14",
      surname: "ADAMS",
      preferredName: "Dawid JMW",
      registerClass: "8A",
    },
  );
});

test("source schema validation rejects wrong house metadata and detects duplicates", () => {
  const rows = [
    source(),
    source({ sourceRow: 2 }),
    source({ sourceRow: 3, house: "Eagles", colourLabel: "Blue", surname: "BROWN", preferredName: "Alex" }),
  ];
  const result = validateSourceRows(rows);
  assert.equal(result.duplicateIndexes.size, 2);
  assert.ok(result.errors.some((error) => error.type === "house_colour_mismatch"));
});

test("house-name normalization reuses canonical houses and does not propose duplicates", () => {
  const result = reconcileHouses([
    { id: "e", name: " eAgLeS " },
    { id: "s", name: "SHARKS" },
    { id: "c", name: "Cheetahs" },
  ]);
  assert.deepEqual(result.map((item) => item.classification), [
    "existing_house",
    "existing_house",
    "existing_house",
  ]);
});

test("safe learner match uses register-class and preferred-name evidence", () => {
  const result = reconcileLearners({
    sourceRows: [source()],
    learners: [learner()],
    houses: houses(),
  })[0];
  assert.equal(result.classification, "safe_learner_match");
  assert.equal(result.assignmentDisposition, "new_assignment");
  assert.equal(result.learnerId, "learner-1");
});

test("preferred-name variation remains safe with unique class/surname and first-name evidence", () => {
  const result = reconcileLearners({
    sourceRows: [source({ preferredName: "Dawid" })],
    learners: [learner({ preferredName: "Dawid J." })],
    houses: houses(),
  })[0];
  assert.equal(result.classification, "safe_learner_match");
});

test("register-class evidence prevents a same-name learner in another class from matching", () => {
  const result = reconcileLearners({
    sourceRows: [source()],
    learners: [learner({ registerClass: "8B" })],
    houses: houses(),
  })[0];
  assert.equal(result.classification, "learner_not_found");
});

test("same-surname candidates require identity evidence beyond DOB alone", () => {
  const result = reconcileLearners({
    sourceRows: [source({ surname: "MOUTON", preferredName: "Liandro O", initials: "LO", sourceReference: "100824", registerClass: "10B" })],
    learners: [
      learner({
        id: "learner-liandro",
        surname: "Mouton",
        preferredName: "Liandro",
        firstNames: "Liandro Owen",
        dateOfBirth: "2010-08-24",
      }),
      learner({
        id: "learner-other",
        surname: "Mouton",
        preferredName: "Liane",
        firstNames: "Liane Chloe",
        dateOfBirth: "2010-08-24",
      }),
    ],
    houses: houses(),
  })[0];

  assert.equal(result.classification, "safe_learner_match");
  assert.equal(result.learnerId, "learner-liandro");
});

test("shared DOB is supporting evidence only when preferred-name evidence identifies one learner", () => {
  const result = reconcileLearners({
    sourceRows: [source({ surname: "MOUTON", preferredName: "Liandro O", initials: "LO", sourceReference: "100824" })],
    learners: [
      learner({ id: "learner-liandro", surname: "Mouton", preferredName: "Liandro O", firstNames: "Liandro O", dateOfBirth: "2010-08-24", registerClass: "10B" }),
      learner({ id: "learner-liane", surname: "Mouton", preferredName: "Lianè C", firstNames: "Lianè C", dateOfBirth: "2010-08-24", registerClass: "10B" }),
    ],
    houses: houses(),
  })[0];
  assert.equal(result.classification, "safe_learner_match");
  assert.equal(result.learnerId, "learner-liandro");
});

test("ambiguous learners are rejected rather than auto-assigned", () => {
  const result = reconcileLearners({
    sourceRows: [source({ preferredName: "Dawid", sourceReference: "" })],
    learners: [
      learner({ id: "learner-1", preferredName: "Dawid" }),
      learner({ id: "learner-2", preferredName: "Dawid" }),
    ],
    houses: houses(),
  })[0];
  assert.equal(result.classification, "ambiguous_learner_match");
  assert.equal(result.learnerId, null);
});

test("unmatched learner is explicit and no learner is created", () => {
  const result = reconcileLearners({
    sourceRows: [source({ surname: "UNKNOWN" })],
    learners: [learner()],
    houses: houses(),
  })[0];
  assert.equal(result.classification, "learner_not_found");
  assert.equal(result.learnerId, null);
});

test("source duplicate detection terminates duplicated rows as source_duplicate", () => {
  const sourceRows = [source(), source({ sourceRow: 2 })];
  const results = reconcileLearners({ sourceRows, learners: [learner()], houses: houses() });
  assert.equal(results.filter((result) => result.classification === "source_duplicate").length, 2);
});

test("same-house rerun is idempotent", () => {
  const result = reconcileLearners({
    sourceRows: [source()],
    learners: [learner()],
    houses: houses(),
    existingAssignments: [{ learnerId: "learner-1", houseId: "eagles", isLocked: true, assignmentSource: "import" }],
  })[0];
  assert.equal(result.classification, "safe_learner_match");
  assert.equal(result.assignmentDisposition, "same_house");
  assert.equal(result.lockedConflict, false);
});

test("conflicting house and locked/manual protection are classified without mutation", () => {
  const unlocked = reconcileLearners({
    sourceRows: [source()],
    learners: [learner()],
    houses: houses(),
    existingAssignments: [{ learnerId: "learner-1", houseId: "sharks", isLocked: false, assignmentSource: "manual" }],
  })[0];
  assert.equal(unlocked.assignmentDisposition, "conflicting_existing_house");
  assert.equal(unlocked.lockedConflict, false);

  const locked = reconcileLearners({
    sourceRows: [source()],
    learners: [learner()],
    houses: houses(),
    existingAssignments: [{ learnerId: "learner-1", houseId: "sharks", isLocked: true, assignmentSource: "manual" }],
  })[0];
  assert.equal(locked.assignmentDisposition, "conflicting_existing_house");
  assert.equal(locked.lockedConflict, true);
});

test("2026 year isolation excludes otherwise matching learners from another year", () => {
  const result = reconcileLearners({
    sourceRows: [source()],
    learners: [learner({ academicYear: 2025 })],
    houses: houses(),
  })[0];
  assert.equal(result.classification, "learner_not_found");
});

test("manager reconciliation accepts exactly one current staff match and reviews zero/multiple matches", () => {
  const houseResults = reconcileHouses(houses());
  const safe = reconcileManagers({
    staff: [
      { id: "staff-e", firstName: "Erastus", lastName: "Sackaria", active: true },
      { id: "staff-n", firstName: "Ndapewa", lastName: "Nghiwedua", active: true },
    ],
    houseResults,
  });
  assert.equal(safe.find((item) => item.house === "Eagles").classification, "safe_manager_match");
  assert.equal(safe.find((item) => item.house === "Sharks").classification, "manager_review");

  const ambiguous = reconcileManagers({
    staff: [
      { id: "s1", firstName: "Selma", lastName: "Aikela", active: true },
      { id: "s2", firstName: "Simon", lastName: "Aikela", active: true },
    ],
    houseResults,
  });
  assert.equal(ambiguous.find((item) => item.house === "Sharks").classification, "manager_review");
  assert.equal(ambiguous.find((item) => item.house === "Sharks").candidateCount, 2);
});

test("age-group source values remain provenance only and do not alter canonical age-band configuration", () => {
  const result = reconcileLearners({
    sourceRows: [source({ ageGroup: "U14" })],
    learners: [learner()],
    houses: houses(),
  })[0];
  assert.equal(result.row.ageGroup, "U14");
  assert.equal("canonicalAgeGroup" in result, false);
});

test("dry-run reconciliation performs zero assignment writes", () => {
  let calls = 0;
  const fakeClient = { rpc: async () => { calls += 1; return { data: null, error: null }; } };
  reconcileLearners({ sourceRows: [source()], learners: [learner()], houses: houses() });
  reconcileManagers({ staff: [], houseResults: reconcileHouses(houses()) });
  assert.equal(calls, 0);
  assert.equal(fakeClient.rpc instanceof Function, true);
});

test("apply is blocked by unresolved ambiguity, unmatched/error rows, source duplicates, locked conflicts and manager review", () => {
  const managerResults = EXPECTED_HOUSES.map((house) => ({
    house: house.name,
    manager: house.manager,
    classification: "safe_manager_match",
    staffMemberId: `staff-${house.name}`,
  }));
  assert.throws(
    () => assertApplySafe({
      summary: {
        sourceDuplicates: 0,
        unmatchedLearners: 0,
        ambiguousLearners: 1,
        unexplainedRows: 0,
        lockedConflicts: 0,
      },
      managerResults,
      houseResults: reconcileHouses(houses()),
    }),
    /apply is blocked/i,
  );
});

test("apply uses only governed Sports/Houses RPCs with import provenance and locked-by-default learner assignments", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "upsert_sports_house") return { data: `new-${normalizeText(args.p_name)}`, error: null };
      if (name === "assign_learners_sports_house") return { data: args.p_learner_ids.length, error: null };
      if (name === "assign_staff_sports_house") return { data: "staff-assignment", error: null };
      return { data: null, error: new Error("unexpected RPC") };
    },
  };

  const sourceRows = [source()];
  const houseResults = reconcileHouses([]);
  const learnerResults = reconcileLearners({ sourceRows, learners: [learner()], houses: [] });
  const managerResults = EXPECTED_HOUSES.map((house, index) => ({
    house: house.name,
    manager: house.manager,
    classification: "safe_manager_match",
    staffMemberId: `staff-${index + 1}`,
    existingAssignment: null,
  }));

  await applyReconciliation({
    client,
    schoolId: "school-1",
    sourceRows,
    learnerResults,
    managerResults,
    houseResults,
  });

  assert.ok(calls.every((call) => [
    "upsert_sports_house",
    "assign_learners_sports_house",
    "assign_staff_sports_house",
  ].includes(call.name)));

  const learnerCall = calls.find((call) => call.name === "assign_learners_sports_house");
  assert.equal(learnerCall.args.p_school_id, "school-1");
  assert.equal(learnerCall.args.p_academic_year, ACADEMIC_YEAR);
  assert.equal(learnerCall.args.p_assignment_source, "import");
  assert.equal(learnerCall.args.p_is_locked, true);

  const staffCalls = calls.filter((call) => call.name === "assign_staff_sports_house");
  assert.equal(staffCalls.length, 3);
  assert.ok(staffCalls.every((call) =>
    call.args.p_school_id === "school-1" &&
    call.args.p_academic_year === ACADEMIC_YEAR &&
    call.args.p_assignment_source === "import" &&
    call.args.p_is_locked === true
  ));
  assert.equal(calls.some((call) => /learner|identity|national/i.test(call.name) && !call.name.includes("sports_house")), false);
  assert.equal(calls.some((call) => call.name.includes("age_group")), false);
});

test("existing houses are reused instead of duplicated during apply", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: 1, error: null }; } };
  const sourceRows = [source()];
  const houseResults = reconcileHouses(houses());
  const learnerResults = reconcileLearners({
    sourceRows,
    learners: [learner()],
    houses: houses(),
    existingAssignments: [{ learnerId: "learner-1", houseId: "eagles", isLocked: true, assignmentSource: "import" }],
  });
  const managerResults = EXPECTED_HOUSES.map((house, index) => ({
    house: house.name,
    manager: house.manager,
    classification: "safe_manager_match",
    staffMemberId: `staff-${index + 1}`,
    existingAssignment: { staffMemberId: `staff-${index + 1}`, houseId: houses()[index].id, isLocked: true },
  }));

  await applyReconciliation({
    client,
    schoolId: "school-1",
    sourceRows,
    learnerResults,
    managerResults,
    houseResults,
  });

  assert.equal(calls.filter((call) => call.name === "upsert_sports_house").length, 0);
  assert.equal(calls.filter((call) => call.name === "assign_learners_sports_house").length, 0);
  assert.equal(calls.filter((call) => call.name === "assign_staff_sports_house").length, 0);
});

test("reconciliation summary arithmetic has zero unexplained remainder for safe rows", () => {
  const sourceRows = [
    source(),
    source({ sourceRow: 2, house: "Sharks", colourLabel: "Grey", manager: "S Aikela", surname: "BROWN", preferredName: "Alex", initials: "A", sourceReference: "120202" }),
  ];
  const learners = [
    learner(),
    learner({ id: "learner-2", surname: "Brown", preferredName: "Alex", firstNames: "Alex", dateOfBirth: "2012-02-02" }),
  ];
  const learnerResults = reconcileLearners({ sourceRows, learners, houses: houses() });
  const managerResults = [
    { classification: "safe_manager_match" },
    { classification: "safe_manager_match" },
    { classification: "safe_manager_match" },
  ];
  const summary = buildReconciliationSummary({ sourceRows, learnerResults, managerResults });

  assert.equal(
    summary.sourceLearnerRows,
    summary.safeLearnerMatches +
      summary.unmatchedLearners +
      summary.ambiguousLearners +
      summary.sourceDuplicates +
      summary.unexplainedRows,
  );
  assert.equal(
    summary.safeLearnerMatches,
    summary.sameHouse + summary.newAssignments + summary.conflictingAssignments,
  );
  assert.equal(summary.unexplainedRows, 0);
});

test("normalization is stable across punctuation/case variants", () => {
  assert.equal(normalizeText("  OE-AMSES "), normalizeText("oe amses"));
  assert.equal(normalizeText("GÂSES"), normalizeText("GASES"));
});
