import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  ACADEMIC_YEAR,
  EXPECTED_PROJECT_REF,
  EXPECTED_SCHOOL_ID,
  EXPECTED_HOUSES,
  applyReconciliation,
  buildReconciliationSummary,
  extractSportsReportPdf,
  normalizeText,
  reconcileHouses,
  reconcileLearners,
  reconcileManagers,
} from "./lib/nhs-2026-sports-houses.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseEnvFile(filePath) {
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function sourceEnvPath() {
  const explicit = arg("--source-env") ?? process.env.SCOLAPRO_SPORTS_SOURCE_ENV;
  if (explicit) return path.resolve(projectRoot, explicit);
  const backups = readdirSync(projectRoot)
    .filter((name) => name.startsWith(".env.local.backup-"))
    .sort()
    .reverse();
  return backups.length ? path.join(projectRoot, backups[0]) : path.join(projectRoot, ".env.local");
}

function assertHostedSource(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error(`Sports import source must be the hosted ScolaPro project ${EXPECTED_PROJECT_REF}; received ${parsed.origin}.`);
  }
}

async function fetchAll(client, table, select = "*", filters = []) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = client.from(table).select(select).range(from, from + pageSize - 1);
    for (const filter of filters) query = query.eq(filter.column, filter.value);
    const result = await query;
    if (result.error) throw new Error(`Unable to read ${table}: ${result.error.message}`);
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < pageSize) break;
  }
  return rows;
}

function chunks(values, size = 200) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchCurrentState(client) {
  const schoolResult = await client.from("schools")
    .select("id,tenant_id,name")
    .eq("id", EXPECTED_SCHOOL_ID)
    .maybeSingle();
  if (schoolResult.error || !schoolResult.data) {
    throw new Error(`Namib High School is unavailable: ${schoolResult.error?.message ?? "not found"}`);
  }

  const enrolments = await fetchAll(client, "enrolments", "learner_id,register_class_id,academic_year,status,enrolled_from,enrolled_to", [
    { column: "school_id", value: EXPECTED_SCHOOL_ID },
    { column: "academic_year", value: ACADEMIC_YEAR },
  ]);
  const currentEnrolments = enrolments.filter((row) => row.status === "current");

  const classIds = [...new Set(currentEnrolments.map((row) => row.register_class_id).filter(Boolean))];
  const classRows = [];
  for (const part of chunks(classIds)) {
    const result = await client.from("register_classes").select("id,class_code,display_name,academic_year").in("id", part);
    if (result.error) throw new Error(`Unable to read register classes: ${result.error.message}`);
    classRows.push(...(result.data ?? []));
  }
  const classById = new Map(classRows.map((row) => [row.id, row]));

  const learnerIds = [...new Set(currentEnrolments.map((row) => row.learner_id))];
  const learnerRows = [];
  for (const part of chunks(learnerIds)) {
    const result = await client.from("learners")
      .select("id,first_names,preferred_name,surname,date_of_birth,sex")
      .in("id", part);
    if (result.error) throw new Error(`Unable to read learner identities: ${result.error.message}`);
    learnerRows.push(...(result.data ?? []));
  }
  const learnerById = new Map(learnerRows.map((row) => [row.id, row]));

  const learners = currentEnrolments.map((enrolment) => {
    const learner = learnerById.get(enrolment.learner_id);
    const registerClass = classById.get(enrolment.register_class_id);
    return {
      id: enrolment.learner_id,
      academicYear: ACADEMIC_YEAR,
      registerClass: registerClass?.class_code ?? registerClass?.display_name ?? "",
      firstNames: learner?.first_names ?? "",
      preferredName: learner?.preferred_name ?? "",
      surname: learner?.surname ?? "",
      dateOfBirth: learner?.date_of_birth ?? null,
      sex: learner?.sex ?? null,
    };
  });

  const houses = (await fetchAll(client, "sports_houses", "id,name,short_code,color_hex,status,sort_order", [
    { column: "school_id", value: EXPECTED_SCHOOL_ID },
  ])).map((row) => ({
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    colorHex: row.color_hex,
    status: row.status,
    sortOrder: row.sort_order,
  }));

  const existingAssignments = (await fetchAll(client, "sports_learner_house_assignments", "learner_id,house_id,assignment_source,is_locked,academic_year", [
    { column: "school_id", value: EXPECTED_SCHOOL_ID },
    { column: "academic_year", value: ACADEMIC_YEAR },
  ])).map((row) => ({
    learnerId: row.learner_id,
    houseId: row.house_id,
    assignmentSource: row.assignment_source,
    isLocked: row.is_locked,
  }));

  const staffAssignments = (await fetchAll(client, "sports_staff_house_assignments", "staff_member_id,house_id,role_key,assignment_source,is_locked,academic_year", [
    { column: "school_id", value: EXPECTED_SCHOOL_ID },
    { column: "academic_year", value: ACADEMIC_YEAR },
  ])).map((row) => ({
    staffMemberId: row.staff_member_id,
    houseId: row.house_id,
    roleKey: row.role_key,
    assignmentSource: row.assignment_source,
    isLocked: row.is_locked,
  }));

  const placements = await fetchAll(client, "staff_school_assignments", "staff_member_id,effective_from,effective_to", [
    { column: "school_id", value: EXPECTED_SCHOOL_ID },
  ]);
  const eligibleStaffIds = [...new Set(
    placements
      .filter((row) =>
        row.effective_from <= `${ACADEMIC_YEAR}-12-31` &&
        (!row.effective_to || row.effective_to >= `${ACADEMIC_YEAR}-01-01`)
      )
      .map((row) => row.staff_member_id),
  )];

  const staffRows = [];
  for (const part of chunks(eligibleStaffIds)) {
    const result = await client.from("staff_members").select("id,first_name,last_name,status").in("id", part);
    if (result.error) throw new Error(`Unable to read staff identities: ${result.error.message}`);
    staffRows.push(...(result.data ?? []));
  }
  const staff = staffRows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    active: row.status === "active",
  }));

  const yearSettingsResult = await client.from("sports_year_settings")
    .select("academic_year,age_reference_date")
    .eq("school_id", EXPECTED_SCHOOL_ID)
    .eq("academic_year", ACADEMIC_YEAR)
    .maybeSingle();
  if (yearSettingsResult.error) throw new Error(`Unable to read sports year settings: ${yearSettingsResult.error.message}`);

  const ageGroups = await fetchAll(client, "sports_age_groups", "id,label,min_age,max_age,status", [
    { column: "school_id", value: EXPECTED_SCHOOL_ID },
  ]);

  return {
    school: schoolResult.data,
    learners,
    houses,
    existingAssignments,
    staff,
    staffAssignments,
    yearSettings: yearSettingsResult.data ?? null,
    ageGroups,
  };
}

function sourcePublicRow(row) {
  return {
    sourcePage: row.sourcePage,
    sourceRow: row.sourceRow,
    house: row.house,
    colourLabel: row.colourLabel,
    manager: row.manager,
    ageGroup: row.ageGroup,
    sex: row.sex,
    surname: row.surname,
    initials: row.initials,
    preferredName: row.preferredName,
    registerClass: row.registerClass,
  };
}

function buildMachineReport({ sourceRows, learnerResults, houseResults, managerResults, summary, current }) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    schoolId: EXPECTED_SCHOOL_ID,
    academicYear: ACADEMIC_YEAR,
    source: {
      file: "sports teams.pdf",
      pages: 30,
      houses: EXPECTED_HOUSES.map(({ name, colourLabel, manager }) => ({ name, colourLabel, manager })),
      learnerRows: sourceRows.length,
    },
    current: {
      houses: current.houses.length,
      learnerAssignments: current.existingAssignments.length,
      staffAssignments: current.staffAssignments.length,
      ageGroups: current.ageGroups.length,
      ageReferenceDate: current.yearSettings?.age_reference_date ?? null,
    },
    summary,
    houseReconciliation: houseResults.map((result) => ({
      house: result.expected.name,
      classification: result.classification,
      existingHouseId: result.house?.id ?? null,
    })),
    managerReconciliation: managerResults,
    rows: learnerResults.map((result) => ({
      source: sourcePublicRow(result.row),
      classification: result.classification,
      assignmentDisposition: result.assignmentDisposition,
      lockedConflict: Boolean(result.lockedConflict),
      learnerId: result.learnerId,
      evidence: result.evidence ?? null,
    })),
    ageGroupConfigWrites: 0,
    writesPerformed: 0,
  };
}

function humanSummary(report) {
  const s = report.summary;
  const classes = Object.entries(s.classes).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  return [
    "# Namib High School 2026 Sports / Houses Dry-Run",
    "",
    `- Source learner rows: **${s.sourceLearnerRows}**`,
    `- Unique source learners: **${s.uniqueSourceLearners}**`,
    `- Source duplicates: **${s.sourceDuplicates}**`,
    `- Safe learner matches: **${s.safeLearnerMatches}**`,
    `- Unmatched learners: **${s.unmatchedLearners}**`,
    `- Ambiguous learners: **${s.ambiguousLearners}**`,
    `- Unexplained/error rows: **${s.unexplainedRows}**`,
    "",
    "## Assignment disposition",
    "",
    `- Same house: **${s.sameHouse}**`,
    `- New assignments: **${s.newAssignments}**`,
    `- Conflicting assignments: **${s.conflictingAssignments}**`,
    `- Locked conflicts: **${s.lockedConflicts}**`,
    "",
    "## House totals",
    "",
    `- Eagles: **${s.houses.Eagles ?? 0}**`,
    `- Sharks: **${s.houses.Sharks ?? 0}**`,
    `- Cheetahs: **${s.houses.Cheetahs ?? 0}**`,
    "",
    "## Managers",
    "",
    `- Safe manager matches: **${s.managerSafeMatches}**`,
    `- Manager review: **${s.managerReview}**`,
    "",
    "## Register classes",
    "",
    "| Class | Source | Safe | Unmatched | Ambiguous | Duplicates | Errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...classes.map(([name, item]) =>
      `| ${name} | ${item.sourceRows} | ${item.safeMatches} | ${item.unmatched} | ${item.ambiguous} | ${item.duplicates} | ${item.errors} |`
    ),
    "",
    "## Safety",
    "",
    "- Dry-run assignment writes: **0**",
    "- Production assignment writes: **0**",
    "- Canonical age-group configuration writes: **0**",
    "- Learner identity writes: **0**",
    "- National-ID writes: **0**",
    "",
  ].join("\n");
}

const pdfPath = arg("--pdf");
if (!pdfPath) {
  throw new Error("Usage: node scripts/nhs-2026-sports-houses-import.mjs --pdf <sports teams.pdf> [--json-out file] [--summary-out file] [--apply]");
}
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);

const envPath = sourceEnvPath();
if (!existsSync(envPath)) throw new Error(`Hosted source env not found: ${envPath}`);
const env = { ...parseEnvFile(envPath), ...process.env };
const sourceUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!sourceUrl || !serviceKey) throw new Error("Hosted source env requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
assertHostedSource(sourceUrl);

const dryRunClient = createClient(sourceUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sourceRows = extractSportsReportPdf(pdfPath);
const current = await fetchCurrentState(dryRunClient);
const houseResults = reconcileHouses(current.houses);
const learnerResults = reconcileLearners({
  sourceRows,
  learners: current.learners,
  existingAssignments: current.existingAssignments,
  houses: current.houses,
});
const managerResults = reconcileManagers({
  staff: current.staff,
  staffAssignments: current.staffAssignments,
  houseResults,
});
const summary = buildReconciliationSummary({ sourceRows, learnerResults, managerResults });
const report = buildMachineReport({ sourceRows, learnerResults, houseResults, managerResults, summary, current });

const jsonOut = arg("--json-out");
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n", "utf8");
const summaryOut = arg("--summary-out");
if (summaryOut) writeFileSync(summaryOut, humanSummary(report) + "\n", "utf8");

console.log(humanSummary(report));

if (!hasFlag("--apply")) {
  console.log("DRY RUN ONLY — no assignment writes performed.");
  process.exit(0);
}

const accessToken = env.SCOLAPRO_SPORTS_IMPORT_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error("Apply requires SCOLAPRO_SPORTS_IMPORT_ACCESS_TOKEN for an authorized school-management user.");
}
const apiKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? serviceKey;
const applyClient = createClient(sourceUrl, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
});

await applyReconciliation({
  client: applyClient,
  schoolId: EXPECTED_SCHOOL_ID,
  sourceRows,
  learnerResults,
  managerResults,
  houseResults,
});

console.log("APPLY COMPLETE — governed Sports / Houses RPCs accepted the reconciled import.");
