import "server-only";

import { getAcademicAnalysisWorkspace, type AcademicAnalysisBasis, type AcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

export const ACADEMIC_SCHEDULE_TYPES = [
  "term_schedule",
  "promotion_schedule",
  "promotion_all_terms",
  "retention_at_risk",
  "incomplete_results",
  "subject_failure",
  "top_achievers",
  "class_grade_summary",
  "promotion_exceptions",
] as const;

export type AcademicScheduleType = (typeof ACADEMIC_SCHEDULE_TYPES)[number];
export type AcademicScheduleBasis = AcademicAnalysisBasis;

export const ACADEMIC_SCHEDULE_LABELS: Record<AcademicScheduleType,string> = {
  term_schedule: "All Results Schedule",
  promotion_schedule: "Promotion Schedule",
  promotion_all_terms: "Promotion Schedule — All Terms",
  retention_at_risk: "Retention / At-Risk Schedule",
  incomplete_results: "Incomplete Results Schedule",
  subject_failure: "Subject Failure Schedule",
  top_achievers: "Top Achievers",
  class_grade_summary: "Class / Grade Results Summary",
  promotion_exceptions: "Promotion Decision Exceptions",
};

export type AcademicSchedulePayload = {
  scheduleType: AcademicScheduleType;
  title: string;
  basis: AcademicScheduleBasis;
  academicYear: number;
  termNumber: number;
  scopeKey: string;
  period: "term" | "all_terms";
  periodLabel: string;
  grade: string | null;
  classNames: string[];
  generatedAt: string;
  sourceDescription: string;
  columns: string[];
  rows: Array<Record<string,string|number|null>>;
  rowCount: number;
  notes: string[];
  subjects?: Array<{ key: string; name: string; maximumMark: number | null; minimumPassMark: number | null }>;
  footerRows?: Array<Record<string,string|number|null>>;
  outcomeAnalysis?: Array<{ outcome: string; female: number; male: number; total: number }>;
};

export type AcademicScheduleFilterOptions = {
  grades: string[];
  classesByGrade: Record<string,string[]>;
  terms: Array<{ number: number; label: string }>;
};

export function academicScheduleScopeKey(input: { period: "term"|"all_terms"; grade?: string; classNames?: string[] }) {
  const grade=encodeURIComponent(input.grade?.trim()||"all");
  const classes=(input.classNames??[]).map((value)=>value.trim()).filter(Boolean).sort().map(encodeURIComponent);
  return `period:${input.period}|grade:${grade}|classes:${classes.join(",")||"all"}`;
}

export type AcademicScheduleHistoryRow = {
  id: string;
  scheduleType: AcademicScheduleType;
  basis: AcademicScheduleBasis;
  version: number;
  status: "finalized" | "superseded";
  title: string;
  generatedAt: string;
  finalizedAt: string;
  supersessionReason: string | null;
};

export type AcademicScheduleSnapshot = {
  id: string;
  payload: AcademicSchedulePayload;
  header: OfficialDocumentHeaderModel | null;
  version: number;
  status: "finalized" | "superseded";
  supersessionReason: string | null;
  finalizedAt: string;
};

type QualityRow = {
  subject_name: string;
  grade_name: string;
  class_name: string;
  component_name: string | null;
  readiness_status: string;
  expected_learners: number;
  captured_records: number;
  missing_required_records: number;
  mark_status_counts: Record<string,number> | null;
  analysis_status: string;
};

function managerRole(role: string) {
  return ["school_admin","principal","deputy_principal"].includes(role);
}

function value(value: number | null) {
  return value == null ? null : value;
}

function basePayload(
  workspace: AcademicAnalysisWorkspace,
  type: AcademicScheduleType,
  columns: string[],
  rows: Array<Record<string,string|number|null>>,
  sourceDescription: string,
  notes: string[] = [],
): AcademicSchedulePayload {
  return {
    scheduleType: type,
    title: ACADEMIC_SCHEDULE_LABELS[type],
    basis: workspace.basis,
    academicYear: workspace.academicYear,
    termNumber: workspace.termNumber,
    scopeKey: academicScheduleScopeKey({ period:"term" }),
    period: "term",
    periodLabel: `Term ${workspace.termNumber}`,
    grade: null,
    classNames: [],
    generatedAt: new Date().toISOString(),
    sourceDescription,
    columns,
    rows,
    rowCount: rows.length,
    notes,
  };
}

type ResultRow = {
  enrolment_id: string;
  subject_offering_id: string;
  term_number: number;
  result_value: number | string | null;
  result_status: string | null;
  symbol: string | null;
  grading_scale_key: string | null;
  grading_scale_version: string | null;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function sexCode(value: string | null | undefined) {
  return value === "female" ? "F" : value === "male" ? "M" : "";
}

function ageOn(dateOfBirth: string | null | undefined, onDate: string) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const at = new Date(`${onDate}T00:00:00Z`);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  if (at.getUTCMonth() < birth.getUTCMonth() || (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export async function getAcademicScheduleFilterOptions(academicYear: number): Promise<AcademicScheduleFilterOptions> {
  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (!context.user || !membership || !managerRole(membership.roleKey)) return { grades: [], classesByGrade: {}, terms: [] };
  const db = await createSupabaseServerClient();
  const [{ data: year }, { data: enrolments }] = await Promise.all([
    db.from("academic_years").select("id").eq("school_id", membership.schoolId).eq("year", academicYear).maybeSingle(),
    db.from("enrolments").select("grades(display_name),register_classes(display_name)").eq("school_id", membership.schoolId).eq("academic_year", academicYear),
  ]);
  const { data: terms } = year?.id
    ? await db.from("academic_terms").select("term_number,display_name").eq("academic_year_id", year.id).order("term_number")
    : { data: [] };
  const classesByGrade: Record<string,string[]> = {};
  for (const row of enrolments ?? []) {
    const grade = relation(row.grades)?.display_name ?? "";
    const className = relation(row.register_classes)?.display_name ?? "";
    if (!grade) continue;
    classesByGrade[grade] = [...new Set([...(classesByGrade[grade] ?? []), ...(className ? [className] : [])])].sort();
  }
  return {
    grades: Object.keys(classesByGrade).sort(),
    classesByGrade,
    terms: (terms ?? []).length
      ? (terms ?? []).map((term) => ({ number: Number(term.term_number), label: String(term.display_name) }))
      : [1,2,3].map((number)=>({number,label:`Term ${number}`})),
  };
}

async function buildOfficialDocument(input: {
  schoolId: string;
  academicYear: number;
  termNumber: number;
  basis: AcademicScheduleBasis;
  scheduleType: "term_schedule" | "promotion_schedule" | "promotion_all_terms";
  grade?: string;
  classNames?: string[];
}): Promise<AcademicSchedulePayload> {
  const db = await createSupabaseServerClient();
  const allTerms = input.scheduleType === "promotion_all_terms";
  const [{ data: academicYearRow }, workspace] = await Promise.all([
    db.from("academic_years").select("id,ends_on").eq("school_id", input.schoolId).eq("year", input.academicYear).maybeSingle(),
    input.basis === "official"
      ? getAcademicAnalysisWorkspace({ academicYear: input.academicYear, termNumber: input.termNumber, basis: input.basis, grade: input.grade, className: input.classNames?.length === 1 ? input.classNames[0] : undefined })
      : Promise.resolve(null),
  ]);
  const { data: termRows } = academicYearRow?.id
    ? await db.from("academic_terms").select("term_number,display_name,starts_on,ends_on").eq("academic_year_id", academicYearRow.id).order("term_number")
    : { data: [] };
  const configuredTerms = (termRows ?? []).map((row) => ({ number: Number(row.term_number), label: String(row.display_name), startsOn: row.starts_on ? String(row.starts_on) : null, endsOn: row.ends_on ? String(row.ends_on) : null }));
  const selectedTerm = configuredTerms.find((term) => term.number === input.termNumber);
  const termNumbers = allTerms ? configuredTerms.map((term) => term.number) : [input.termNumber];

  let resultData: ResultRow[] = [];
  if (input.basis === "official") {
    let resultQuery = db.from("official_results_current")
      .select("enrolment_id,subject_offering_id,term_number,result_value,result_status,symbol,grading_scale_key,grading_scale_version")
      .eq("school_id", input.schoolId)
      .eq("academic_year", input.academicYear);
    resultQuery = termNumbers.length ? resultQuery.in("term_number", termNumbers) : resultQuery.eq("term_number", input.termNumber);
    const { data, error } = await resultQuery;
    if (error) throw new Error("Unable to load canonical official schedule results.");
    resultData = (data ?? []) as ResultRow[];
  }
  const results = resultData;
  const enrolmentIds = [...new Set(results.map((row) => row.enrolment_id))];
  const offeringIds = [...new Set(results.map((row) => row.subject_offering_id))];
  const [{ data: enrolmentData }, { data: offeringData }, { data: progressions }, { data: absenceData }] = await Promise.all([
    enrolmentIds.length ? db.from("enrolments").select("id,learner_id,admission_number,grade_id,register_class_id,enrolled_from,learners!inner(first_names,surname,date_of_birth,sex),grades(display_name),register_classes(display_name)").in("id", enrolmentIds) : Promise.resolve({ data: [] }),
    offeringIds.length ? db.from("subject_offerings").select("id,subject_id,subjects(display_name,subject_code)").in("id", offeringIds) : Promise.resolve({ data: [] }),
    enrolmentIds.length ? db.from("year_end_progressions").select("enrolment_id,outcome,status,rule_set_key,rule_set_version").in("enrolment_id", enrolmentIds) : Promise.resolve({ data: [] }),
    enrolmentIds.length ? db.from("daily_register_current").select("enrolment_id,status,attendance_date").in("enrolment_id", enrolmentIds).eq("status", "absent") : Promise.resolve({ data: [] }),
  ]);
  const enrolments = (enrolmentData ?? []).filter((row) => {
    const grade = relation(row.grades)?.display_name ?? "";
    const className = relation(row.register_classes)?.display_name ?? "";
    return (!input.grade || grade === input.grade) && (!input.classNames?.length || input.classNames.includes(className));
  });
  const allowedEnrolments = new Set(enrolments.map((row) => row.id));
  const filteredResults = results.filter((row) => allowedEnrolments.has(row.enrolment_id));
  const offeringMap = new Map((offeringData ?? []).map((row) => [row.id, relation(row.subjects)]));
  const subjects = [...new Map(filteredResults.map((row) => {
    const subject = offeringMap.get(row.subject_offering_id);
    return [row.subject_offering_id, { key: row.subject_offering_id, name: subject?.display_name ?? subject?.subject_code ?? "Subject", maximumMark: null as number | null, minimumPassMark: null as number | null }];
  })).values()].sort((a,b) => a.name.localeCompare(b.name));

  const scaleRefs = [...new Set(filteredResults.filter((row) => row.grading_scale_key && row.grading_scale_version).map((row) => `${row.grading_scale_key}::${row.grading_scale_version}`))];
  const { data: scales } = scaleRefs.length ? await db.from("grading_scales").select("id,scale_key,version").eq("school_id", input.schoolId) : { data: [] };
  const scaleIds = (scales ?? []).filter((scale) => scaleRefs.includes(`${scale.scale_key}::${scale.version}`)).map((scale) => scale.id);
  const { data: bands } = scaleIds.length ? await db.from("grading_scale_bands").select("grading_scale_id,minimum_value,maximum_value,pass_classification").in("grading_scale_id", scaleIds) : { data: [] };
  const scaleByRef = new Map((scales ?? []).map((scale) => [`${scale.scale_key}::${scale.version}`, scale.id]));
  for (const subject of subjects) {
    const refResult = filteredResults.find((row) => row.subject_offering_id === subject.key && row.grading_scale_key && row.grading_scale_version);
    const scaleId = refResult ? scaleByRef.get(`${refResult.grading_scale_key}::${refResult.grading_scale_version}`) : null;
    const scaleBands = (bands ?? []).filter((band) => band.grading_scale_id === scaleId);
    const passMinimums = scaleBands.filter((band) => band.pass_classification === "pass").map((band) => Number(band.minimum_value)).filter(Number.isFinite);
    const maxima = scaleBands.map((band) => band.maximum_value == null ? null : Number(band.maximum_value));
    subject.minimumPassMark = passMinimums.length ? Math.min(...passMinimums) : null;
    subject.maximumMark = maxima.length && maxima.every((maximum): maximum is number => maximum != null && Number.isFinite(maximum)) ? Math.max(...maxima) : null;
  }

  const resultsByLearner = new Map<string,ResultRow[]>();
  for (const result of filteredResults) resultsByLearner.set(result.enrolment_id, [...(resultsByLearner.get(result.enrolment_id) ?? []), result]);
  const progressionMap = new Map((progressions ?? []).map((row) => [row.enrolment_id, row]));
  const absentByLearner = new Map<string,number>();
  const periodStart = allTerms ? configuredTerms[0]?.startsOn : selectedTerm?.startsOn;
  const periodEnd = allTerms ? configuredTerms.at(-1)?.endsOn : selectedTerm?.endsOn;
  for (const absence of absenceData ?? []) {
    const day = String(absence.attendance_date);
    if ((!periodStart || day >= periodStart) && (!periodEnd || day <= periodEnd)) absentByLearner.set(absence.enrolment_id, (absentByLearner.get(absence.enrolment_id) ?? 0) + 1);
  }
  const readinessByEnrolment = new Map((workspace?.learnerRiskRows ?? []).map((row) => [row.enrolmentId, row.promotionReadiness]));
  const reportDate = selectedTerm?.endsOn ?? academicYearRow?.ends_on ?? new Date().toISOString().slice(0,10);
  const ranked = enrolments.map((enrolment) => {
    const learner = relation(enrolment.learners);
    const learnerResults = resultsByLearner.get(enrolment.id) ?? [];
    const currentResults = learnerResults.filter((row) => row.term_number === input.termNumber && row.result_value != null);
    const avg = currentResults.length ? Math.round((currentResults.reduce((sum,row) => sum + Number(row.result_value),0) / currentResults.length) * 100) / 100 : null;
    return { enrolment, learner, learnerResults, avg };
  }).sort((a,b) => (b.avg ?? -1) - (a.avg ?? -1) || `${a.learner?.surname ?? ""}${a.learner?.first_names ?? ""}`.localeCompare(`${b.learner?.surname ?? ""}${b.learner?.first_names ?? ""}`));
  const rankById = new Map(ranked.filter((row) => row.avg != null).map((row,index) => [row.enrolment.id,index+1]));
  const termAverageByEnrolment = new Map<string,Map<number,number|null>>();
  const termRankByEnrolment = new Map<string,Map<number,number>>();
  for (const term of configuredTerms) {
    const averages = ranked.map((entry) => {
      const values = entry.learnerResults.filter((row)=>row.term_number===term.number&&row.result_value!=null).map((row)=>Number(row.result_value));
      return { id: entry.enrolment.id, average: values.length ? Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*100)/100 : null };
    }).sort((a,b)=>(b.average??-1)-(a.average??-1));
    averages.forEach((item,index)=>{
      const termAverages=termAverageByEnrolment.get(item.id)??new Map<number,number|null>();
      termAverages.set(term.number,item.average);
      termAverageByEnrolment.set(item.id,termAverages);
      if(item.average!=null){const termRanks=termRankByEnrolment.get(item.id)??new Map<number,number>();termRanks.set(term.number,index+1);termRankByEnrolment.set(item.id,termRanks);}
    });
  }
  const rows: Array<Record<string,string|number|null>> = [];
  for (const entry of ranked) {
    const grade = relation(entry.enrolment.grades)?.display_name ?? "";
    const className = relation(entry.enrolment.register_classes)?.display_name ?? "";
    const base: Record<string,string|number|null> = input.scheduleType === "term_schedule" ? {
      "No.": rows.length + 1,
      "Admission Number": entry.enrolment.admission_number ?? "",
      Student: [entry.learner?.surname, entry.learner?.first_names].filter(Boolean).join(", "),
      "Home Language": "",
      "Birth Date": entry.learner?.date_of_birth ?? "",
      Age: ageOn(entry.learner?.date_of_birth, String(reportDate)),
      "Days Absent": absentByLearner.get(entry.enrolment.id) ?? 0,
      Gender: sexCode(entry.learner?.sex),
      "Years in Grade": "",
      "Years in Phase": "",
    } : {
      Learner: [entry.learner?.surname, entry.learner?.first_names].filter(Boolean).join(", "),
      Sex: sexCode(entry.learner?.sex),
      DOB: entry.learner?.date_of_birth ?? "",
      "Average %": entry.avg,
      Rank: rankById.get(entry.enrolment.id) ?? null,
    };
    if (allTerms) {
      for (const term of configuredTerms) {
        const termResults = entry.learnerResults.filter((row) => row.term_number === term.number);
        const cycle: Record<string,string|number|null> = { ...base, "Average %": termAverageByEnrolment.get(entry.enrolment.id)?.get(term.number)??null, Rank: termRankByEnrolment.get(entry.enrolment.id)?.get(term.number)??null, Cycle: term.label };
        for (const subject of subjects) {
          const result = termResults.find((row) => row.subject_offering_id === subject.key);
          cycle[subject.name] = result?.result_value ?? result?.result_status ?? "";
        }
        cycle["Days Absent"] = absentByLearner.get(entry.enrolment.id) ?? 0;
        cycle["Years in Phase"] = "";
        cycle.Recommendation = "";
        cycle.Ruling = "";
        cycle.Remarks = "";
        rows.push(cycle);
      }
      const progression = progressionMap.get(entry.enrolment.id);
      const promotion: Record<string,string|number|null> = { ...base, Cycle: "Promotion", "Days Absent": absentByLearner.get(entry.enrolment.id) ?? 0, "Years in Phase": "", Recommendation: readinessByEnrolment.get(entry.enrolment.id)?.recommendedOutcome ?? "", Ruling: progression && ["approved","locked"].includes(progression.status) ? progression.outcome : "", Remarks: "" };
      for (const subject of subjects) promotion[subject.name] = "";
      rows.push(promotion);
    } else {
      for (const subject of subjects) {
        const result = entry.learnerResults.find((row) => row.term_number === input.termNumber && row.subject_offering_id === subject.key);
        if (input.scheduleType === "term_schedule") {
          base[`${subject.name} Symbol`] = result?.symbol ?? "";
          base[`${subject.name} Mark`] = result?.result_value ?? result?.result_status ?? "";
        } else base[subject.name] = result?.result_value ?? result?.result_status ?? "";
      }
      if (input.scheduleType === "term_schedule") {
        base["Overall %"] = entry.avg;
        base["Support comments"] = "";
      } else {
        const progression = progressionMap.get(entry.enrolment.id);
        base["Days Absent"] = absentByLearner.get(entry.enrolment.id) ?? 0;
        base["Years in Phase"] = "";
        base.Recommendation = readinessByEnrolment.get(entry.enrolment.id)?.recommendedOutcome ?? "";
        base.Ruling = progression && ["approved","locked"].includes(progression.status) ? progression.outcome : "";
        base.Remarks = "";
      }
      rows.push(base);
    }
  }
  const columns = input.scheduleType === "term_schedule"
    ? ["No.","Admission Number","Student","Home Language","Birth Date","Age","Days Absent","Gender","Years in Grade","Years in Phase",...subjects.flatMap((subject)=>[`${subject.name} Symbol`,`${subject.name} Mark`]),"Overall %","Support comments"]
    : ["Learner","Sex","DOB","Average %","Rank",...(allTerms?["Cycle"]:[]),...subjects.map((subject)=>subject.name),"Days Absent","Years in Phase","Recommendation","Ruling","Remarks"];
  const footerRows = input.scheduleType === "term_schedule" ? [] : [
    Object.fromEntries(columns.map((column) => [column, column === "Learner" ? "Maximum Mark" : subjects.find((subject) => subject.name === column)?.maximumMark ?? ""])),
    Object.fromEntries(columns.map((column) => [column, column === "Learner" ? "Minimum pass / promotion threshold" : subjects.find((subject) => subject.name === column)?.minimumPassMark ?? ""])),
    Object.fromEntries(columns.map((column) => [column, column === "Learner" ? "Total Mark" : subjects.some((subject) => subject.name === column) ? filteredResults.filter((result) => offeringMap.get(result.subject_offering_id)?.display_name === column && result.result_value != null).reduce((sum,result) => sum + Number(result.result_value),0) : ""])),
    Object.fromEntries(columns.map((column) => [column, column === "Learner" ? "Total Learners" : subjects.some((subject) => subject.name === column) ? new Set(filteredResults.filter((result) => offeringMap.get(result.subject_offering_id)?.display_name === column).map((result) => result.enrolment_id)).size : ""])),
    Object.fromEntries(columns.map((column) => [column, column === "Learner" ? "Class Average" : subjects.some((subject) => subject.name === column) ? (() => { const values=filteredResults.filter((result) => offeringMap.get(result.subject_offering_id)?.display_name === column && result.result_value != null).map((result)=>Number(result.result_value)); return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)/100 : ""; })() : ""])),
  ];
  const outcomes = ["condoned","not_promoted","passed","promoted","transferred"];
  const outcomeAnalysis = outcomes.map((outcome) => {
    const cohort = enrolments.filter((enrolment) => progressionMap.get(enrolment.id)?.outcome === outcome);
    return { outcome: outcome.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase()), female: cohort.filter((row)=>relation(row.learners)?.sex === "female").length, male: cohort.filter((row)=>relation(row.learners)?.sex === "male").length, total: cohort.length };
  });
  return {
    scheduleType: input.scheduleType,
    title: ACADEMIC_SCHEDULE_LABELS[input.scheduleType],
    basis: input.basis,
    academicYear: input.academicYear,
    termNumber: input.termNumber,
    scopeKey: academicScheduleScopeKey({ period:allTerms?"all_terms":"term", grade:input.grade, classNames:input.classNames }),
    period: allTerms ? "all_terms" : "term",
    periodLabel: allTerms ? "All Terms" : selectedTerm?.label ?? `Term ${input.termNumber}`,
    grade: input.grade ?? (new Set(enrolments.map((row)=>relation(row.grades)?.display_name).filter(Boolean)).size === 1 ? relation(enrolments[0]?.grades)?.display_name ?? null : null),
    classNames: [...new Set(enrolments.map((row)=>relation(row.register_classes)?.display_name).filter((name): name is string => Boolean(name)))].sort(),
    generatedAt: new Date().toISOString(),
    sourceDescription: input.basis === "official"
      ? "Supplied-source fidelity: Namibia promotion schedules and Generic Mark Schedule; populated from official_results_current, canonical enrolment/learner, attendance, curriculum, grading and governed promotion sources."
      : "Provisional preview is intentionally empty when no canonical per-learner provisional result matrix is available; official rows are never relabelled as provisional.",
    columns, rows, rowCount: rows.length, subjects, footerRows, outcomeAnalysis,
    notes: ["Blank home language, support comments, years-in-grade/phase, remarks, signatures and unapproved rulings are intentional where no canonical governed source exists.", "Marks below a governed pass threshold are document exceptions; no promotion decision is calculated in this report.", ...(input.basis === "provisional" ? ["No official result is substituted into this provisional preview."] : [])],
  };
}

async function qualityRows(schoolId: string, academicYear: number, termNumber: number): Promise<QualityRow[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("get_assessment_quality_readiness", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
    p_term_number: termNumber,
  });
  if (error) throw new Error("Unable to load canonical assessment readiness.");
  return (data ?? []) as QualityRow[];
}

export async function getAcademicSchedulePayload(input: {
  academicYear: number;
  termNumber: number;
  basis: AcademicScheduleBasis;
  scheduleType: AcademicScheduleType;
  grade?: string;
  classNames?: string[];
}): Promise<AcademicSchedulePayload | null> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length || !context.currentSchoolMembership) return null;
  const membership = context.currentSchoolMembership;
  if (!managerRole(membership.roleKey)) return null;

  if (["term_schedule","promotion_schedule","promotion_all_terms"].includes(input.scheduleType)) {
    return buildOfficialDocument({ ...input, schoolId: membership.schoolId, scheduleType: input.scheduleType as "term_schedule"|"promotion_schedule"|"promotion_all_terms" });
  }

  const workspace = await getAcademicAnalysisWorkspace({
    academicYear: input.academicYear,
    termNumber: input.termNumber,
    basis: input.basis,
  });
  if (!workspace) return null;

  const type = input.scheduleType;
  if (type === "term_schedule") {
    const rows = workspace.learnerRiskRows.map((row) => ({
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      "Subjects assessed": row.assessedSubjects,
      Average: value(row.average),
      Failures: row.riskLevel === "unavailable" ? null : row.failedSubjects,
      "Promotion readiness": row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status,
    }));
    return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Subjects assessed","Average","Failures","Promotion readiness"],rows,"Canonical academic results and promotion-readiness read model.");
  }

  if (type === "promotion_schedule") {
    const rows = workspace.learnerRiskRows
      .filter((row) => row.promotionReadiness.status !== "unavailable")
      .map((row) => ({
        Learner: row.learnerName,
        "Admission No.": row.admissionNumber,
        Grade: row.grade,
        Class: row.className,
        Average: value(row.average),
        "Recommended outcome": row.promotionReadiness.recommendedOutcome ?? (row.promotionReadiness.status === "ready" ? "ready" : "not ready"),
        "Failed conditions": row.promotionReadiness.failedConditions,
        "Rule set": row.promotionReadiness.ruleSetKey ? row.promotionReadiness.ruleSetKey + " · " + (row.promotionReadiness.ruleSetVersion ?? "") : null,
      }));
    return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Average","Recommended outcome","Failed conditions","Rule set"],rows,"Canonical promotion-readiness engine; no report-side promotion calculation.",["Empty when no active governed promotion rule set is available."]);
  }

  if (type === "retention_at_risk") {
    const rows = workspace.learnerRiskRows
      .filter((row) => row.riskLevel === "high" || row.riskLevel === "watch" || row.promotionReadiness.status === "not_ready")
      .map((row) => ({
        Learner: row.learnerName,
        "Admission No.": row.admissionNumber,
        Grade: row.grade,
        Class: row.className,
        Average: value(row.average),
        Failures: row.failedSubjects,
        "Promotional failures": row.promotionalSubjectFailures,
        "Near threshold": row.nearThresholdSubjects,
        Risk: row.riskLevel,
        "Promotion readiness": row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status,
      }));
    return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Average","Failures","Promotional failures","Near threshold","Risk","Promotion readiness"],rows,"Governed Academic Analysis learner-risk indicators plus canonical promotion readiness.");
  }

  if (type === "incomplete_results") {
    const readiness = await qualityRows(workspace.schoolId,workspace.academicYear,workspace.termNumber);
    const rows = readiness
      .filter((row) => row.missing_required_records > 0 || !["verified","locked"].includes(row.readiness_status))
      .map((row) => ({
        Grade: row.grade_name,
        Class: row.class_name,
        Subject: row.subject_name,
        Component: row.component_name ?? "Final result",
        Readiness: row.readiness_status,
        Expected: row.expected_learners,
        Captured: row.captured_records,
        "Missing required": row.missing_required_records,
        "Absent / incomplete": Number(row.mark_status_counts?.absent ?? 0) + Number(row.mark_status_counts?.incomplete ?? 0),
        "Analysis status": row.analysis_status,
      }));
    return basePayload(workspace,type,["Grade","Class","Subject","Component","Readiness","Expected","Captured","Missing required","Absent / incomplete","Analysis status"],rows,"Canonical Assessment Quality/Readiness RPC with dated enrolment and subject-registration eligibility.");
  }

  if (type === "subject_failure") {
    const rows = workspace.rows
      .filter((row) => row.summary.failed > 0)
      .map((row) => ({
        Grade: row.grade,
        Class: row.className ?? "",
        Subject: row.subject,
        Assessed: row.summary.assessedLearners,
        Failed: row.summary.failed,
        "Fail %": value(row.summary.failRate),
        Average: value(row.summary.average),
        "Grading scale": row.gradingScaleKey ? row.gradingScaleKey + " · " + (row.gradingScaleVersion ?? "") : null,
      }));
    return basePayload(workspace,type,["Grade","Class","Subject","Assessed","Failed","Fail %","Average","Grading scale"],rows,"Canonical official/provisional academic result summaries with governed grading classifications.");
  }

  if (type === "top_achievers") {
    const rows = workspace.topLearners.map((row,index) => ({
      No: index + 1,
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      Average: value(row.average),
      "Subjects assessed": row.assessedSubjects,
    }));
    return basePayload(workspace,type,["No","Learner","Admission No.","Grade","Class","Average","Subjects assessed"],rows,"Canonical Academic Analysis top-N view; descriptive ordering only, not an evaluative learner label.");
  }

  if (type === "class_grade_summary") {
    const gradeRows = workspace.gradeSummaries.map((row) => ({
      Scope: "Grade",
      Group: row.label,
      Assessed: row.summary.assessedLearners,
      Average: value(row.summary.average),
      "Pass %": value(row.summary.passRate),
      "Fail %": value(row.summary.failRate),
    }));
    const classRows = workspace.classSummaries.map((row) => ({
      Scope: "Class",
      Group: row.label,
      Assessed: row.summary.assessedLearners,
      Average: value(row.summary.average),
      "Pass %": value(row.summary.passRate),
      "Fail %": value(row.summary.failRate),
    }));
    return basePayload(workspace,type,["Scope","Group","Assessed","Average","Pass %","Fail %"],[...gradeRows,...classRows],"Canonical Academic Analysis grade/class aggregates.");
  }

  const rows = workspace.learnerRiskRows
    .filter((row) => row.promotionReadiness.status === "not_ready" || row.promotionReadiness.failedConditions > 0)
    .map((row) => ({
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      "Recommended outcome": row.promotionReadiness.recommendedOutcome ?? "not ready",
      "Failed conditions": row.promotionReadiness.failedConditions,
      "Rule set": row.promotionReadiness.ruleSetKey ? row.promotionReadiness.ruleSetKey + " · " + (row.promotionReadiness.ruleSetVersion ?? "") : null,
    }));
  return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Recommended outcome","Failed conditions","Rule set"],rows,"Canonical promotion-readiness exceptions; no report-side decision engine.",["Empty when no governed promotion exception exists."]);
}

export async function getAcademicScheduleHistory(input: {
  academicYear: number;
  termNumber: number;
  scheduleType: AcademicScheduleType;
  scopeKey?: string;
}): Promise<AcademicScheduleHistoryRow[]> {
  const context = await getUserContext();
  if (!context.user || !context.currentSchoolMembership || !managerRole(context.currentSchoolMembership.roleKey)) return [];
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("academic_schedule_snapshots")
    .select("id,schedule_type,basis,version,status,title,generated_at,finalized_at,supersession_reason")
    .eq("school_id",context.currentSchoolMembership.schoolId)
    .eq("academic_year",input.academicYear)
    .eq("term_number",input.termNumber)
    .eq("schedule_type",input.scheduleType)
    .eq("scope_key",input.scopeKey ?? academicScheduleScopeKey({period:"term"}))
    .order("version",{ascending:false});
  if (error) throw new Error("Unable to load academic schedule history.");
  return (data ?? []).map((row) => ({
    id:String(row.id),
    scheduleType:String(row.schedule_type) as AcademicScheduleType,
    basis:String(row.basis) as AcademicScheduleBasis,
    version:Number(row.version),
    status:String(row.status) as AcademicScheduleHistoryRow["status"],
    title:String(row.title),
    generatedAt:String(row.generated_at),
    finalizedAt:String(row.finalized_at),
    supersessionReason:row.supersession_reason ? String(row.supersession_reason) : null,
  }));
}

export async function getAcademicScheduleSnapshot(snapshotId: string): Promise<AcademicScheduleSnapshot | null> {
  const context = await getUserContext();
  if (!context.user || !context.currentSchoolMembership || !managerRole(context.currentSchoolMembership.roleKey)) return null;
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("academic_schedule_snapshots")
    .select("id,school_id,version,status,payload,metadata,finalized_at,supersession_reason")
    .eq("id",snapshotId)
    .eq("school_id",context.currentSchoolMembership.schoolId)
    .maybeSingle();
  if (error || !data) return null;
  const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? data.metadata as Record<string,unknown>
    : {};
  const rawHeader = metadata.documentHeader && typeof metadata.documentHeader === "object" && !Array.isArray(metadata.documentHeader)
    ? metadata.documentHeader as OfficialDocumentHeaderModel
    : null;
  const header: OfficialDocumentHeaderModel | null = rawHeader ? {
    ...rawHeader,
    provenance: { ...rawHeader.provenance, source: "frozen_snapshot" },
  } : null;
  return {
    id:String(data.id),
    payload:data.payload as unknown as AcademicSchedulePayload,
    header,
    version:Number(data.version),
    status:String(data.status) as AcademicScheduleSnapshot["status"],
    supersessionReason:data.supersession_reason ? String(data.supersession_reason) : null,
    finalizedAt:String(data.finalized_at),
  };
}
