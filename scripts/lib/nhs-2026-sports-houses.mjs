import { execFileSync } from "node:child_process";

export const EXPECTED_SCHOOL_ID = "22222222-2222-4222-8222-222222222222";
export const EXPECTED_PROJECT_REF = "jhgumnvhoxmapmgotchu";
export const ACADEMIC_YEAR = 2026;

export const EXPECTED_HOUSES = Object.freeze([
  { name: "Eagles", colourLabel: "White", colorHex: "#FFFFFF", manager: "E Sackaria", shortCode: "EAG", sortOrder: 1 },
  { name: "Sharks", colourLabel: "Grey", colorHex: "#808080", manager: "S Aikela", configuredManager: "Josephine Aikela", shortCode: "SHA", sortOrder: 2 },
  { name: "Cheetahs", colourLabel: "Orange", colorHex: "#FFA500", manager: "N Nghiwedua", shortCode: "CHE", sortOrder: 3 },
]);

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function firstToken(value) {
  return normalizeText(String(value ?? "").trim().split(/\s+/)[0] ?? "");
}

function initialsFromNames(value) {
  return String(value ?? "")
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .toLowerCase();
}

function parsePage(page, pageNumber) {
  const teamMatch = page.match(/TEAM:\s+([A-Z]+)\s+\(([^)]+)\)/);
  if (!teamMatch) return [];

  const house = teamMatch[1][0] + teamMatch[1].slice(1).toLowerCase();
  const colourLabel = teamMatch[2][0] + teamMatch[2].slice(1).toLowerCase();
  const managerMatch = page.match(/TEAM MANAGER:\s+([A-Z]\s+[A-Z]+)/);
  const manager = managerMatch
    ? managerMatch[1].split(/\s+/).map((part, index) => index === 0 ? part : part[0] + part.slice(1).toLowerCase()).join(" ")
    : "";

  const lines = page.split(/\r?\n/);
  const rows = [];
  let ageGroup = null;
  let sex = null;
  let columns = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/UNDER\s+(\d+)\s+(BOYS|GIRLS)/);
    if (heading) {
      ageGroup = `U${heading[1]}`;
      sex = heading[2] === "BOYS" ? "M" : "F";
      columns = null;
      continue;
    }

    if (ageGroup && line.includes("Nr Surname") && line.includes("Register class")) {
      columns = {
        nr: line.indexOf("Nr"),
        surname: line.indexOf("Surname"),
        initials: line.indexOf("Initials"),
        preferred: line.indexOf("Preferred name"),
        idNumber: line.indexOf("ID Number"),
        registerClass: line.indexOf("Register class"),
      };
      continue;
    }

    if (!columns) continue;

    const numberCell = line.length >= columns.surname
      ? line.slice(columns.nr, columns.surname)
      : line;

    if (!/^\s*\d+\s*$/.test(numberCell) || !line.includes("Grade ")) continue;

    const classMatch = line.match(/Grade\s+(\d+)\/([A-Z])\s*$/);
    if (!classMatch) continue;

    let preferredName = line.slice(columns.preferred, columns.idNumber).trim();
    let sourceReference = line.slice(columns.idNumber, columns.registerClass).trim();

    if (!sourceReference) {
      const shiftedReference = preferredName.match(/^(.*?)(?:\s+)?(\d{6,13})$/);
      if (shiftedReference) {
        preferredName = shiftedReference[1].trim();
        sourceReference = shiftedReference[2];
      }
    }

    rows.push({
      sourcePage: pageNumber,
      sourceRow: Number(numberCell.trim()),
      house,
      colourLabel,
      manager,
      ageGroup,
      sex,
      surname: line.slice(columns.surname, columns.initials).trim(),
      initials: line.slice(columns.initials, columns.preferred).trim(),
      preferredName,
      sourceReference,
      registerClass: `${classMatch[1]}${classMatch[2]}`,
      _lineIndex: index,
      _columns: columns,
      _lines: lines,
    });
  }

  for (const row of rows) {
    if (row.preferredName) continue;

    const fragments = [];
    for (const direction of [-1, 1]) {
      const found = [];
      let index = row._lineIndex + direction;
      let steps = 0;

      while (index >= 0 && index < row._lines.length && steps < 4) {
        const line = row._lines[index];
        steps += 1;

        if (/UNDER\s+\d+\s+(BOYS|GIRLS)/.test(line) || line.includes("Nr Surname")) break;

        const numberCell = line.length >= row._columns.surname
          ? line.slice(row._columns.nr, row._columns.surname)
          : line;
        if (/^\s*\d+\s*$/.test(numberCell) && line.includes("Grade ")) break;

        if (line.trim()) {
          const preferred = line.length > row._columns.preferred
            ? line.slice(row._columns.preferred, row._columns.idNumber).trim()
            : "";
          const left = line.slice(0, row._columns.preferred).trim();
          const right = line.length > row._columns.idNumber
            ? line.slice(row._columns.idNumber).trim()
            : "";

          if (preferred && !left && !right) found.push(preferred);
          else break;
        }

        index += direction;
      }

      if (direction === -1) fragments.push(...found.reverse());
      else fragments.push(...found);
    }

    row.preferredName = fragments.join(" ").trim();
  }

  return rows.map(({ _lineIndex, _columns, _lines, ...row }) => row);
}

export function parseSportsReportLayoutText(text) {
  const rows = [];
  const pages = String(text ?? "").split("\f");

  for (let index = 0; index < pages.length; index += 1) {
    rows.push(...parsePage(pages[index], index + 1));
  }

  return rows;
}

export function extractSportsReportPdf(pdfPath) {
  const layoutText = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseSportsReportLayoutText(layoutText);
}

export function validateSourceRows(rows) {
  const errors = [];
  const expectedHouseMap = new Map(EXPECTED_HOUSES.map((house) => [normalizeText(house.name), house]));
  const duplicateKeyCounts = new Map();

  rows.forEach((row, index) => {
    const expected = expectedHouseMap.get(normalizeText(row.house));
    if (!expected) errors.push({ index, type: "unexpected_house", message: `Unexpected house ${row.house}` });
    if (expected && normalizeText(row.colourLabel) !== normalizeText(expected.colourLabel)) {
      errors.push({ index, type: "house_colour_mismatch", message: `${row.house} colour does not match the authoritative source definition` });
    }
    if (expected && normalizeText(row.manager) !== normalizeText(expected.manager)) {
      errors.push({ index, type: "house_manager_mismatch", message: `${row.house} manager does not match the authoritative source definition` });
    }
    if (!/^\d{1,2}[A-Z]$/.test(row.registerClass)) {
      errors.push({ index, type: "invalid_register_class", message: `Invalid register class ${row.registerClass}` });
    }
    if (!/^U\d{2}$/.test(row.ageGroup)) {
      errors.push({ index, type: "invalid_age_group", message: `Invalid source age group ${row.ageGroup}` });
    }
    if (!["M", "F"].includes(row.sex)) {
      errors.push({ index, type: "invalid_sex", message: `Invalid source sex ${row.sex}` });
    }
    if (!row.surname || !row.preferredName) {
      errors.push({ index, type: "missing_identity_evidence", message: "Surname and preferred name are required for reconciliation" });
    }

    const duplicateKey = [row.registerClass, normalizeText(row.surname), normalizeText(row.preferredName)].join("|");
    duplicateKeyCounts.set(duplicateKey, (duplicateKeyCounts.get(duplicateKey) ?? 0) + 1);
  });

  const duplicateIndexes = new Set();
  rows.forEach((row, index) => {
    const key = [row.registerClass, normalizeText(row.surname), normalizeText(row.preferredName)].join("|");
    if ((duplicateKeyCounts.get(key) ?? 0) > 1) duplicateIndexes.add(index);
  });

  return { errors, duplicateIndexes };
}

function candidateEvidence(row, learner) {
  const sourcePreferred = normalizeText(row.preferredName);
  const sourceFirst = firstToken(row.preferredName);
  const learnerPreferred = normalizeText(learner.preferredName);
  const learnerFirst = firstToken(learner.preferredName || learner.firstNames);
  const legalFirst = firstToken(learner.firstNames);
  const sourceInitials = normalizeText(row.initials);
  const legalInitials = normalizeText(initialsFromNames(learner.firstNames));
  const sourceDobRef = String(row.sourceReference ?? "").match(/^(\d{6})/)?.[1] ?? "";
  const learnerDobRef = learner.dateOfBirth
    ? String(learner.dateOfBirth).slice(2, 10).replaceAll("-", "")
    : "";

  const preferredExact = Boolean(sourcePreferred && learnerPreferred && sourcePreferred === learnerPreferred);
  const firstNameMatch = Boolean(sourceFirst && (sourceFirst === learnerFirst || sourceFirst === legalFirst));
  const initialsMatch = Boolean(sourceInitials && legalInitials && (
    sourceInitials === legalInitials ||
    sourceInitials.startsWith(legalInitials) ||
    legalInitials.startsWith(sourceInitials)
  ));
  const dobMatch = Boolean(sourceDobRef && learnerDobRef && sourceDobRef === learnerDobRef);

  return {
    preferredExact,
    firstNameMatch,
    initialsMatch,
    dobMatch,
    strong:
      preferredExact ||
      (firstNameMatch && (dobMatch || initialsMatch)) ||
      (dobMatch && initialsMatch),
  };
}

export function reconcileLearners({ sourceRows, learners, existingAssignments = [], houses = [] }) {
  const { errors: sourceErrors, duplicateIndexes } = validateSourceRows(sourceRows);
  const assignmentByLearner = new Map(existingAssignments.map((assignment) => [assignment.learnerId, assignment]));
  const houseById = new Map(houses.map((house) => [house.id, house]));
  const results = [];

  sourceRows.forEach((row, index) => {
    if (duplicateIndexes.has(index)) {
      results.push({ index, row, classification: "source_duplicate", assignmentDisposition: null, learnerId: null });
      return;
    }

    const candidates = learners.filter((learner) =>
      learner.academicYear === ACADEMIC_YEAR &&
      normalizeText(learner.registerClass) === normalizeText(row.registerClass) &&
      normalizeText(learner.surname) === normalizeText(row.surname)
    );

    if (!candidates.length) {
      results.push({ index, row, classification: "learner_not_found", assignmentDisposition: null, learnerId: null });
      return;
    }

    const scored = candidates.map((learner) => ({ learner, evidence: candidateEvidence(row, learner) }));
    const preferredMatches = scored.filter((candidate) => candidate.evidence.preferredExact);
    const namedMatches = scored.filter((candidate) =>
      candidate.evidence.firstNameMatch && candidate.evidence.initialsMatch
    );
    const namedDobMatches = scored.filter((candidate) =>
      candidate.evidence.firstNameMatch && candidate.evidence.dobMatch
    );

    let matched = null;
    if (preferredMatches.length === 1) {
      matched = preferredMatches[0];
    } else if (namedMatches.length === 1) {
      matched = namedMatches[0];
    } else if (namedDobMatches.length === 1) {
      matched = namedDobMatches[0];
    } else if (
      scored.length === 1 &&
      (scored[0].evidence.firstNameMatch || scored[0].evidence.dobMatch)
    ) {
      matched = scored[0];
    }

    if (!matched) {
      results.push({
        index,
        row,
        classification: "ambiguous_learner_match",
        assignmentDisposition: null,
        learnerId: null,
        candidateCount: candidates.length,
      });
      return;
    }

    const existing = assignmentByLearner.get(matched.learner.id) ?? null;
    const existingHouse = existing ? houseById.get(existing.houseId) ?? null : null;
    let assignmentDisposition = "new_assignment";

    if (existing) {
      if (existingHouse && normalizeText(existingHouse.name) === normalizeText(row.house)) {
        assignmentDisposition = "same_house";
      } else {
        assignmentDisposition = "conflicting_existing_house";
      }
    }

    results.push({
      index,
      row,
      classification: "safe_learner_match",
      assignmentDisposition,
      lockedConflict: assignmentDisposition === "conflicting_existing_house" && Boolean(existing?.isLocked),
      learnerId: matched.learner.id,
      evidence: matched.evidence,
      existingAssignment: existing,
      existingHouse,
    });
  });

  for (const error of sourceErrors) {
    const current = results[error.index];
    if (!current || current.classification === "source_duplicate") continue;
    results[error.index] = {
      index: error.index,
      row: sourceRows[error.index],
      classification: "unexplained_error",
      assignmentDisposition: null,
      learnerId: null,
      error,
    };
  }

  return results;
}

export function reconcileHouses(existingHouses) {
  return EXPECTED_HOUSES.map((expected) => {
    const matches = existingHouses.filter((house) => normalizeText(house.name) === normalizeText(expected.name));
    if (matches.length > 1) return { expected, classification: "ambiguous_existing_house", matches };
    if (matches.length === 1) return { expected, classification: "existing_house", house: matches[0] };
    return { expected, classification: "create_house", house: null };
  });
}

export function reconcileManagers({ staff, staffAssignments = [], houseResults = [] }) {
  const assignmentByStaff = new Map(staffAssignments.map((assignment) => [assignment.staffMemberId, assignment]));
  const desiredHouseByName = new Map(houseResults.map((item) => [normalizeText(item.expected.name), item]));

  return EXPECTED_HOUSES.map((house) => {
    const configuredManager = house.configuredManager ?? null;
    const [sourceInitial, ...surnameParts] = house.manager.split(/\s+/);
    const sourceSurname = surnameParts.join(" ");
    const [configuredFirstName, ...configuredSurnameParts] = configuredManager?.split(/\s+/) ?? [];
    const configuredSurname = configuredSurnameParts.join(" ");
    const candidates = staff.filter((member) => {
      if (member.active === false) return false;
      if (configuredManager) {
        return normalizeText(member.firstName) === normalizeText(configuredFirstName) &&
          normalizeText(member.lastName) === normalizeText(configuredSurname);
      }
      return normalizeText(member.lastName) === normalizeText(sourceSurname) &&
        normalizeText(member.firstName).startsWith(normalizeText(sourceInitial));
    });

    if (candidates.length !== 1) {
      return {
        house: house.name,
        manager: house.manager,
        configuredManager,
        classification: "manager_review",
        candidateCount: candidates.length,
      };
    }

    const staffMember = candidates[0];
    const existing = assignmentByStaff.get(staffMember.id) ?? null;
    const desired = desiredHouseByName.get(normalizeText(house.name));
    const desiredHouseId = desired?.house?.id ?? null;

    if (existing && desiredHouseId && existing.houseId !== desiredHouseId) {
      return {
        house: house.name,
        manager: house.manager,
        configuredManager,
        classification: "manager_review",
        candidateCount: 1,
        staffMemberId: staffMember.id,
        reason: existing.isLocked ? "locked_conflicting_staff_assignment" : "conflicting_staff_assignment",
      };
    }

    return {
      house: house.name,
      manager: house.manager,
      configuredManager,
      classification: "safe_manager_match",
      candidateCount: 1,
      staffMemberId: staffMember.id,
      existingAssignment: existing,
    };
  });
}

export function buildReconciliationSummary({ sourceRows, learnerResults, managerResults }) {
  const summary = {
    sourceLearnerRows: sourceRows.length,
    uniqueSourceLearners: 0,
    sourceDuplicates: 0,
    safeLearnerMatches: 0,
    unmatchedLearners: 0,
    ambiguousLearners: 0,
    unexplainedRows: 0,
    sameHouse: 0,
    newAssignments: 0,
    conflictingAssignments: 0,
    lockedConflicts: 0,
    managerSafeMatches: managerResults.filter((result) => result.classification === "safe_manager_match").length,
    managerReview: managerResults.filter((result) => result.classification === "manager_review").length,
    houses: { Eagles: 0, Sharks: 0, Cheetahs: 0 },
    classes: {},
  };

  for (const result of learnerResults) {
    const row = result.row;
    summary.houses[row.house] = (summary.houses[row.house] ?? 0) + 1;
    summary.classes[row.registerClass] ??= {
      sourceRows: 0,
      safeMatches: 0,
      unmatched: 0,
      ambiguous: 0,
      duplicates: 0,
      errors: 0,
    };
    const classSummary = summary.classes[row.registerClass];
    classSummary.sourceRows += 1;

    if (result.classification === "source_duplicate") {
      summary.sourceDuplicates += 1;
      classSummary.duplicates += 1;
      continue;
    }

    summary.uniqueSourceLearners += 1;

    if (result.classification === "safe_learner_match") {
      summary.safeLearnerMatches += 1;
      classSummary.safeMatches += 1;
      if (result.assignmentDisposition === "same_house") summary.sameHouse += 1;
      if (result.assignmentDisposition === "new_assignment") summary.newAssignments += 1;
      if (result.assignmentDisposition === "conflicting_existing_house") {
        summary.conflictingAssignments += 1;
        if (result.lockedConflict) summary.lockedConflicts += 1;
      }
    } else if (result.classification === "learner_not_found") {
      summary.unmatchedLearners += 1;
      classSummary.unmatched += 1;
    } else if (result.classification === "ambiguous_learner_match") {
      summary.ambiguousLearners += 1;
      classSummary.ambiguous += 1;
    } else {
      summary.unexplainedRows += 1;
      classSummary.errors += 1;
    }
  }

  return summary;
}

export function assertApplySafe({ summary, managerResults, houseResults }) {
  const blockers = [];
  if (summary.sourceDuplicates) blockers.push(`${summary.sourceDuplicates} source duplicate row(s)`);
  if (summary.unmatchedLearners) blockers.push(`${summary.unmatchedLearners} unmatched learner(s)`);
  if (summary.ambiguousLearners) blockers.push(`${summary.ambiguousLearners} ambiguous learner match(es)`);
  if (summary.unexplainedRows) blockers.push(`${summary.unexplainedRows} unexplained/error row(s)`);
  if (summary.lockedConflicts) blockers.push(`${summary.lockedConflicts} locked learner conflict(s)`);
  if (managerResults.some((result) => result.classification !== "safe_manager_match")) blockers.push("manager reconciliation is incomplete");
  if (houseResults.some((result) => result.classification === "ambiguous_existing_house")) blockers.push("house reconciliation is ambiguous");

  if (blockers.length) {
    throw new Error(`Sports / Houses apply is blocked: ${blockers.join("; ")}.`);
  }
}

export async function applyReconciliation({
  client,
  schoolId,
  sourceRows,
  learnerResults,
  managerResults,
  houseResults,
}) {
  const summary = buildReconciliationSummary({ sourceRows, learnerResults, managerResults });
  assertApplySafe({ summary, managerResults, houseResults });

  const resolvedHouseIds = new Map();

  for (const result of houseResults) {
    let houseId = result.house?.id ?? null;
    if (!houseId) {
      const { data, error } = await client.rpc("upsert_sports_house", {
        p_school_id: schoolId,
        p_name: result.expected.name,
        p_short_code: result.expected.shortCode,
        p_color_hex: result.expected.colorHex,
        p_sort_order: result.expected.sortOrder,
        p_house_id: null,
      });
      if (error || !data) throw new Error(`Unable to create ${result.expected.name}: ${error?.message ?? "missing house id"}`);
      houseId = data;
    }
    resolvedHouseIds.set(normalizeText(result.expected.name), houseId);
  }

  for (const house of EXPECTED_HOUSES) {
    const learnerIds = learnerResults
      .filter((result) =>
        result.classification === "safe_learner_match" &&
        normalizeText(result.row.house) === normalizeText(house.name) &&
        result.assignmentDisposition !== "same_house"
      )
      .map((result) => result.learnerId);

    if (!learnerIds.length) continue;

    const { error } = await client.rpc("assign_learners_sports_house", {
      p_school_id: schoolId,
      p_academic_year: ACADEMIC_YEAR,
      p_learner_ids: learnerIds,
      p_house_id: resolvedHouseIds.get(normalizeText(house.name)),
      p_assignment_source: "import",
      p_is_locked: true,
    });
    if (error) throw new Error(`Unable to assign ${house.name} learners: ${error.message}`);
  }

  for (const manager of managerResults) {
    if (manager.existingAssignment) continue;
    const { error } = await client.rpc("assign_staff_sports_house", {
      p_school_id: schoolId,
      p_academic_year: ACADEMIC_YEAR,
      p_staff_member_id: manager.staffMemberId,
      p_house_id: resolvedHouseIds.get(normalizeText(manager.house)),
      p_role_key: "leader",
      p_assignment_source: "import",
      p_is_locked: true,
    });
    if (error) throw new Error(`Unable to assign ${manager.manager}: ${error.message}`);
  }

  return summary;
}
