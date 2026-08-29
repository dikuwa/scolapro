export type CsvLearnerRow = Record<string, string>;

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

export function normalizeImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const knownHeaders = new Set([
  "admission_number", "first_names", "first_name", "initials", "surname", "last_name", "sex", "gender", "date_of_birth", "dob",
  "date_of_admission", "admission_date", "enrolled_from", "enrolment_date", "enrollment_date",
  "grade_code", "class_code", "employee_number", "employee_no", "staff_number", "identity_number", "learner_admission_number",
  "record_type", "code", "display_name",
]);

export function rowsToRecords(rows: string[][]): CsvLearnerRow[] {
  const usableRows = rows.filter((row) => row.some((value) => String(value ?? "").trim()));
  if (usableRows.length < 2) return [];

  const headerIndex = usableRows.findIndex((row) => {
    const normalized = row.map((value) => normalizeImportHeader(String(value ?? ""))).filter(Boolean);
    return normalized.filter((header) => knownHeaders.has(header)).length >= 2;
  });
  if (headerIndex < 0) return [];

  const headers = usableRows[headerIndex].map((value) => normalizeImportHeader(String(value ?? "")));
  return usableRows.slice(headerIndex + 1).map((row) => {
    const record: CsvLearnerRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = String(row[index] ?? "").trim();
      // Exported school spreadsheets sometimes repeat the same identifier column.
      // Keep the first non-empty value instead of silently overwriting it.
      if (!(header in record) || (!record[header] && value)) record[header] = value;
    });
    return record;
  }).filter((record) => Object.values(record).some(Boolean));
}

export function parseCsv(text: string): CsvLearnerRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  return rowsToRecords(lines.map(splitCsvLine));
}

export function normalizeSex(value: string) {
  const sex = value.trim().toLowerCase();
  if (["f", "female", "girl"].includes(sex)) return "female";
  if (["m", "male", "boy"].includes(sex)) return "male";
  if (["other"].includes(sex)) return "other";
  return "unspecified";
}
