import "server-only";

import { buildSchoolDocumentProfile } from "@/features/documents/server/school-document-profile";

export type JsonRecord = Record<string, unknown>;

export type ReportCardRenderInput = {
  schoolName: string;
  schoolEmisNumber?: string | null;
  snapshotVersion: number;
  certifiedAt?: string | null;
  dataSnapshot: JsonRecord;
  logoBytes?: Uint8Array | null;
};

export type ReportCardTermResult = {
  subjectOfferingId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  resultValue: string;
  percentageValue: string;
  symbol: string;
  numericValue: number | null;
  minimumPassMark: number | null;
  promotional: boolean;
  showOnReportCard: boolean;
};

export type ReportCardTerm = {
  number: number;
  name: string;
  results: ReportCardTermResult[];
};

export type ReportCardSubjectRow = {
  key: string;
  name: string;
  code: string;
  promotional: boolean;
  showOnReportCard: boolean;
  minimumPassMark: number | null;
  termResults: Map<number, ReportCardTermResult>;
};

export type ReportCardTemplateModel = {
  schoolName: string;
  schoolEmisNumber: string;
  formerName: string;
  logoUrl: string;
  logoStoragePath: string;
  physicalAddress: string;
  telephone: string;
  fax: string;
  email: string;
  postalAddress: string;
  town: string;
  schoolNameFont: "default" | "old_english";
  learnerName: string;
  admissionNumber: string;
  grade: string;
  registerClass: string;
  academicYear: string;
  currentTermNumber: number;
  currentTermName: string;
  learnerAverage: string;
  terms: ReportCardTerm[];
  subjectRows: ReportCardSubjectRow[];
  showPercentages: boolean;
  showNonPromotionalSubjects: boolean;
  showPassMarkLegend: boolean;
  remarks: string;
  remarksMode: "manual";
  absentDays: string;
  registerTeacherName: string;
  principalName: string;
  nextTermStartsOn: string;
  snapshotVersion: number;
  certifiedAt: string;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function formatReportCardDate(value: unknown): string {
  const source = text(value).trim();
  if (!source) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  if (!match) return source;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return source;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return source;
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resultFromRecord(item: JsonRecord): ReportCardTermResult {
  const status = text(item.result_status);
  const numericValue = status === "numeric" ? number(item.result_value) : null;
  const resultValue = status === "numeric" ? text(item.result_value) : status || "-";
  const percentageValue = text(item.percentage_value || item.result_percentage || item.result_value);
  return {
    subjectOfferingId: text(item.subject_offering_id),
    subjectId: text(item.subject_id),
    subjectName: text(item.subject_name) || "Subject",
    subjectCode: text(item.subject_code),
    resultValue,
    percentageValue,
    symbol: text(item.symbol),
    numericValue,
    minimumPassMark: number(item.minimum_pass_mark),
    promotional: boolean(item.promotional, true),
    showOnReportCard: boolean(item.show_on_report_card, true),
  };
}

function legacyTerm(snapshot: JsonRecord): ReportCardTerm {
  const term = record(snapshot.term);
  const numberValue = number(term.number) ?? 1;
  const results = Array.isArray(snapshot.results) ? snapshot.results.map(record).map(resultFromRecord) : [];
  return {
    number: numberValue,
    name: text(term.name) || `Term ${numberValue}`,
    results,
  };
}

function termsFromSnapshot(snapshot: JsonRecord): ReportCardTerm[] {
  if (!Array.isArray(snapshot.report_terms) || snapshot.report_terms.length === 0) return [legacyTerm(snapshot)];
  const terms = snapshot.report_terms
    .map(record)
    .map((term) => {
      const termNumber = number(term.number) ?? 0;
      return {
        number: termNumber,
        name: text(term.name) || `Term ${termNumber}`,
        results: Array.isArray(term.results) ? term.results.map(record).map(resultFromRecord) : [],
      };
    })
    .filter((term) => term.number > 0)
    .sort((a, b) => a.number - b.number);
  return terms.length ? terms : [legacyTerm(snapshot)];
}

function subjectRowsFromTerms(terms: ReportCardTerm[], showNonPromotionalSubjects: boolean): ReportCardSubjectRow[] {
  const rows = new Map<string, ReportCardSubjectRow>();
  for (const term of terms) {
    for (const result of term.results) {
      const key = result.subjectId || result.subjectOfferingId || `${result.subjectCode}:${result.subjectName}`;
      const existing = rows.get(key);
      if (existing) {
        existing.termResults.set(term.number, result);
        if (existing.minimumPassMark === null && result.minimumPassMark !== null) existing.minimumPassMark = result.minimumPassMark;
        existing.promotional = existing.promotional && result.promotional;
        existing.showOnReportCard = existing.showOnReportCard && result.showOnReportCard;
      } else {
        rows.set(key, {
          key,
          name: result.subjectName,
          code: result.subjectCode,
          promotional: result.promotional,
          showOnReportCard: result.showOnReportCard,
          minimumPassMark: result.minimumPassMark,
          termResults: new Map([[term.number, result]]),
        });
      }
    }
  }
  return [...rows.values()]
    .filter((row) => row.showOnReportCard && (showNonPromotionalSubjects || row.promotional))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function calculateLearnerAverage(
  snapshot: JsonRecord,
  subjectRows: ReportCardSubjectRow[],
  currentTermNumber: number,
): string {
  const explicit = number(snapshot.learner_average ?? snapshot.average);
  if (explicit !== null) return Number.isInteger(explicit) ? String(explicit) : explicit.toFixed(1);

  const values = subjectRows
    .map((row) => row.termResults.get(currentTermNumber)?.numericValue ?? null)
    .filter((value): value is number => value !== null);
  if (!values.length) return "";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number.isInteger(average) ? String(average) : average.toFixed(1);
}

export function buildReportCardTemplateModel(input: ReportCardRenderInput): ReportCardTemplateModel {
  const snapshot = record(input.dataSnapshot);
  const settings = record(snapshot.report_card_settings);
  const learner = record(snapshot.learner);
  const enrolment = record(snapshot.enrolment);
  const currentTerm = record(snapshot.term);
  const attendance = record(snapshot.attendance);
  const registerTeacher = record(snapshot.register_teacher);
  const principal = record(snapshot.principal);
  const documentProfile = buildSchoolDocumentProfile({
    fallbackSchoolName: input.schoolName,
    fallbackSchoolEmisNumber: input.schoolEmisNumber,
    schoolIdentity: snapshot.school_identity,
    schoolDocumentProfile: snapshot.school_document_profile,
  });

  const learnerName = [learner.first_names, learner.surname].map(text).filter(Boolean).join(" ");
  const terms = termsFromSnapshot(snapshot);
  const currentTermNumber = number(currentTerm.number) ?? terms.at(-1)?.number ?? 1;
  const currentTermName = text(currentTerm.name) || terms.find((term) => term.number === currentTermNumber)?.name || `Term ${currentTermNumber}`;
  const showNonPromotionalSubjects = boolean(settings.show_non_promotional_subjects, true);
  const subjectRows = subjectRowsFromTerms(terms, showNonPromotionalSubjects);

  return {
    schoolName: documentProfile.schoolName,
    schoolEmisNumber: documentProfile.schoolEmisNumber,
    formerName: documentProfile.formerName,
    logoUrl: documentProfile.logoUrl,
    logoStoragePath: documentProfile.logoStoragePath,
    physicalAddress: documentProfile.physicalAddress,
    telephone: documentProfile.telephone,
    fax: documentProfile.fax,
    email: documentProfile.email,
    postalAddress: documentProfile.postalAddress,
    town: documentProfile.town,
    schoolNameFont: documentProfile.schoolNameFont,
    learnerName,
    admissionNumber: text(enrolment.admission_number),
    grade: text(enrolment.grade),
    registerClass: text(enrolment.register_class),
    academicYear: text(enrolment.academic_year),
    currentTermNumber,
    currentTermName,
    learnerAverage: calculateLearnerAverage(snapshot, subjectRows, currentTermNumber),
    terms,
    subjectRows,
    showPercentages: boolean(settings.show_percentages, false),
    showNonPromotionalSubjects,
    showPassMarkLegend: boolean(settings.show_pass_mark_legend, true),
    remarks: text(snapshot.remarks || settings.default_remark),
    // Until a governed rules/AI pipeline creates a reviewed learner-specific remark,
    // the renderer must not imply that one of those engines supplied certified text.
    remarksMode: "manual",
    absentDays: text(attendance.absent ?? 0),
    registerTeacherName: text(registerTeacher.name),
    principalName: text(principal.name),
    nextTermStartsOn: formatReportCardDate(snapshot.next_term_starts_on),
    snapshotVersion: input.snapshotVersion,
    certifiedAt: text(input.certifiedAt),
  };
}

export function isFailingResult(result: ReportCardTermResult | undefined, fallbackPassMark: number | null): boolean {
  if (!result || result.numericValue === null) return false;
  const threshold = result.minimumPassMark ?? fallbackPassMark;
  return threshold !== null && result.numericValue < threshold;
}
