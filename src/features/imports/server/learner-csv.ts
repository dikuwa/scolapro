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

export function parseCsv(text: string): CsvLearnerRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

export function normalizeSex(value: string) {
  const sex = value.trim().toLowerCase();
  if (["f", "female", "girl"].includes(sex)) return "female";
  if (["m", "male", "boy"].includes(sex)) return "male";
  if (["other"].includes(sex)) return "other";
  return "unspecified";
}
