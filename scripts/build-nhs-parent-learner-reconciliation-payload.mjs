import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const learnersPath = arg("--learners");
const guardiansPath = arg("--guardians");
const outPath = arg("--out");

if (!learnersPath || !guardiansPath || !outPath) {
  throw new Error("Usage: node scripts/build-nhs-parent-learner-reconciliation-payload.mjs --learners <learners.csv> --guardians <guardian-relationships.csv> --out <rows.json>");
}

function readRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function clean(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (["", "N/A", "NA", "NONE", "UNKNOWN", "NO PHONE NRS", "NO PHONE", "-", "--"].includes(text.toUpperCase())) return "";
  return text;
}

function splitGuardianName(fullName) {
  const value = clean(fullName);
  const parts = value.split(" ").filter(Boolean);
  if (parts.length < 2) return { first_names: "", surname: "", issue: "Guardian name cannot be split safely into first names and surname." };
  return { first_names: parts.slice(0, -1).join(" "), surname: parts.at(-1), issue: "" };
}

function normalizeSex(value) {
  const text = clean(value).toLowerCase();
  if (text === "m" || text === "male") return "male";
  if (text === "f" || text === "female") return "female";
  return text || "unspecified";
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const learnerRows = readRows(learnersPath);
const guardianRows = readRows(guardiansPath);
const guardiansByAdmission = new Map();

for (const row of guardianRows) {
  const admission = clean(row.learner_admission_number).toUpperCase();
  if (!admission) continue;
  const parsed = splitGuardianName(row.guardian_name_raw);
  const issues = [];
  if (parsed.issue) issues.push({ level: "error", field: "guardian_name", message: parsed.issue });

  const guardian = {
    identity_number: "",
    first_names: parsed.first_names,
    surname: parsed.surname,
    preferred_name: "",
    relationship_type: clean(row.relationship_type).toLowerCase() || "parent",
    priority: Number(row.guardian_priority || 1),
    email: clean(row.email_raw).toLowerCase(),
    mobile: clean(row.mobile_raw),
    whatsapp: "",
    home_phone: clean(row.home_phone_raw),
    work_phone: clean(row.work_phone_raw),
    physical_address: clean(row.residential_address),
    postal_address: clean(row.postal_address),
    work_address: clean(row.work_address),
    is_legal_guardian: false,
    is_emergency_contact: false,
    is_pickup_authorized: false,
    source_guardian_name: clean(row.guardian_name_raw),
    issues,
  };

  const list = guardiansByAdmission.get(admission) ?? [];
  list.push(guardian);
  guardiansByAdmission.set(admission, list);
}

const stagedLearners = [];
const stagedGuardians = [];
const seenAdmissions = new Set();

for (let index = 0; index < learnerRows.length; index += 1) {
  const row = learnerRows[index];
  const admission = clean(row.learner_admission_number).toUpperCase();
  if (!admission) throw new Error(`Learner row ${index + 2} has no admission number.`);
  if (seenAdmissions.has(admission)) throw new Error(`Duplicate admission number in normalized learners.csv: ${admission}`);
  seenAdmissions.add(admission);

  const sourceId = clean(row.source_id_number_raw);
  const sourceIdSafe = clean(row.source_id_number_safe_to_map_national_id).toUpperCase();
  const learnerIssues = [];
  if (sourceId && sourceIdSafe !== "YES") {
    learnerIssues.push({
      level: "warning",
      field: "source_id_number",
      message: "Source ID NUMBER is retained for provenance only and is not mapped to national_id.",
    });
  }

  stagedLearners.push({
    row_number: index + 2,
    source: row,
    normalized: {
      admission_number: admission,
      academic_year: 2026,
      register_class_code: clean(row.register_class).toUpperCase(),
      surname: clean(row.surname),
      preferred_name: clean(row.preferred_name_raw),
      sex: normalizeSex(row.sex),
      date_of_birth: clean(row.date_of_birth),
      source_id_number_raw: sourceId,
    },
    resolution: learnerIssues.some((issue) => issue.level === "error") ? "error" : "review",
    issues: learnerIssues,
  });

  for (const guardian of guardiansByAdmission.get(admission) ?? []) {
    const issues = [...guardian.issues];
    const hasContactEvidence = Boolean(guardian.email || guardian.mobile || guardian.home_phone || guardian.work_phone);
    if (!hasContactEvidence) {
      issues.push({
        level: "warning",
        field: "contact",
        message: "Guardian has no phone/email evidence; only an exact existing learner-linked guardian may be reused safely.",
      });
    }

    stagedGuardians.push({
      row_number: stagedGuardians.length + 2,
      source: {
        learner_admission_number: admission,
        guardian_name: guardian.source_guardian_name,
      },
      normalized: {
        learner_admission_number: admission,
        identity_number: "",
        first_names: guardian.first_names,
        surname: guardian.surname,
        preferred_name: "",
        relationship_type: guardian.relationship_type,
        priority: guardian.priority,
        email: guardian.email,
        mobile: guardian.mobile,
        whatsapp: guardian.whatsapp,
        home_phone: guardian.home_phone,
        work_phone: guardian.work_phone,
        physical_address: guardian.physical_address,
        postal_address: guardian.postal_address,
        work_address: guardian.work_address,
        is_legal_guardian: false,
        is_emergency_contact: false,
        is_pickup_authorized: false,
      },
      resolution: issues.some((issue) => issue.level === "error") ? "error" : "review",
      issues,
    });
  }
}

const payload = {
  source: {
    learners_file: path.basename(learnersPath),
    learners_sha256: sha256(learnersPath),
    guardians_file: path.basename(guardiansPath),
    guardians_sha256: sha256(guardiansPath),
    roster_date: "2026-09-26",
  },
  counts: {
    learner_rows: stagedLearners.length,
    guardian_rows: stagedGuardians.length,
  },
  learner_rows: stagedLearners,
  guardian_rows: stagedGuardians,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(JSON.stringify(payload.counts));
console.log(`Wrote reconciliation payload to ${outPath}`);
