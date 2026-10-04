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

export type AcademicScheduleSourceReadiness = {
  label: string;
  status: "available" | "partial" | "unavailable";
  detail: string;
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
  gradeId: string | null;
  grade: string | null;
  classIds: string[];
  classNames: string[];
  generatedAt: string;
  sourceDescription: string;
  sourceReadiness?: AcademicScheduleSourceReadiness[];
  columns: string[];
  rows: Array<Record<string,string|number|null>>;
  rowCount: number;
  notes: string[];
  subjects?: Array<{
    key: string;
    name: string;
    code: string | null;
    maximumMark: number | null;
    minimumPassMark: number | null;
    minimumPassMarkSource: "promotion_rule" | "grading_scale" | null;
  }>;
  footerRows?: Array<Record<string,string|number|null>>;
  outcomeAnalysis?: Array<{ outcome: string; female: number | null; male: number | null; total: number | null }>;
};

export type AcademicScheduleGradeOption = { value: string; label: string; code: string };
export type AcademicScheduleClassOption = { value: string; label: string; code: string };

export type AcademicScheduleFilterOptions = {
  grades: AcademicScheduleGradeOption[];
  classesByGrade: Record<string,AcademicScheduleClassOption[]>;
  terms: Array<{ number: number; label: string }>;
};

export function academicScheduleScopeKey(input: { period: "term"|"all_terms"; gradeId?: string | null; classIds?: string[] }) {
  const gradeId=input.gradeId?.trim()||"missing";
  const classIds=[...new Set((input.classIds??[]).map((value)=>value.trim()).filter(Boolean))].sort();
  return "period:"+input.period+"|grade-id:"+gradeId+"|class-ids:"+(classIds.join(",")||"all");
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
    scopeKey: academicScheduleScopeKey({ period:"term", gradeId:"legacy-analysis" }),
    period: "term",
    periodLabel: "Term " + workspace.termNumber,
    gradeId: null,
    grade: null,
    classIds: [],
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
  const context=await getUserContext();
  const membership=context.currentSchoolMembership;
  if(!context.user||!membership||!managerRole(membership.roleKey)) return {grades:[],classesByGrade:{},terms:[]};
  const db=await createSupabaseServerClient();
  const [{data:year},{data:grades,error:gradeError},{data:classes,error:classError}]=await Promise.all([
    db.from("academic_years").select("id").eq("school_id",membership.schoolId).eq("year",academicYear).maybeSingle(),
    db.from("grades").select("id,grade_code,display_name").eq("school_id",membership.schoolId).eq("academic_year",academicYear),
    db.from("register_classes").select("id,grade_id,class_code,display_name").eq("school_id",membership.schoolId).eq("academic_year",academicYear),
  ]);
  if(gradeError||classError) throw new Error("Unable to load academic schedule scope options.");
  const {data:terms}=year?.id
    ? await db.from("academic_terms").select("term_number,display_name").eq("academic_year_id",year.id).order("term_number")
    : {data:[]};
  const gradeOptions=(grades??[]).map((row)=>({value:String(row.id),label:String(row.display_name),code:String(row.grade_code)}))
    .sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
  const classesByGrade:Record<string,AcademicScheduleClassOption[]>={};
  for(const grade of gradeOptions){
    classesByGrade[grade.value]=(classes??[])
      .filter((row)=>row.grade_id===grade.value)
      .map((row)=>({value:String(row.id),label:String(row.display_name),code:String(row.class_code)}))
      .sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
  }
  return {
    grades:gradeOptions,
    classesByGrade,
    terms:(terms??[]).length
      ? (terms??[]).map((term)=>({number:Number(term.term_number),label:String(term.display_name)}))
      : [1,2,3].map((number)=>({number,label:"Term "+number})),
  };
}

function roundedAverage(values: number[]) {
  return values.length ? Math.round((values.reduce((sum,item)=>sum+item,0)/values.length)*100)/100 : null;
}

function competitionRanks(items: Array<{ id: string; average: number | null }>) {
  const ranked=items.filter((item)=>item.average!=null)
    .sort((a,b)=>(b.average??-Infinity)-(a.average??-Infinity)||a.id.localeCompare(b.id));
  const result=new Map<string,number>();
  let previous:number|null=null;
  let currentRank=0;
  ranked.forEach((item,index)=>{
    if(previous==null||item.average!==previous) currentRank=index+1;
    result.set(item.id,currentRank);
    previous=item.average;
  });
  return result;
}

function distinctAbsenceCounts(
  rows: Array<{ enrolment_id: string; attendance_date: string }>,
  start: string | null | undefined,
  end: string | null | undefined,
) {
  const dates=new Map<string,Set<string>>();
  for(const row of rows){
    const day=String(row.attendance_date);
    if(start&&day<start) continue;
    if(end&&day>end) continue;
    const set=dates.get(row.enrolment_id)??new Set<string>();
    set.add(day);
    dates.set(row.enrolment_id,set);
  }
  return new Map([...dates.entries()].map(([key,set])=>[key,set.size]));
}

async function loadAllOfficialResults(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId: string,
  academicYear: number,
  termNumbers: number[],
  enrolmentIds: string[],
): Promise<ResultRow[]> {
  if(!termNumbers.length||!enrolmentIds.length) return [];
  const rows:ResultRow[]=[];
  const pageSize=1000;
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await db.from("official_results_current")
      .select("enrolment_id,subject_offering_id,term_number,result_value,result_status,symbol,grading_scale_key,grading_scale_version")
      .eq("school_id",schoolId)
      .eq("academic_year",academicYear)
      .in("term_number",termNumbers)
      .in("enrolment_id",enrolmentIds)
      .range(offset,offset+pageSize-1);
    if(error) throw new Error("Unable to load canonical official schedule results.");
    const batch=(data??[]) as ResultRow[];
    rows.push(...batch);
    if(batch.length<pageSize) break;
  }
  return rows;
}

async function loadActiveRegistrations(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId: string,
  academicYear: number,
  enrolmentIds: string[],
) {
  if(!enrolmentIds.length) return [] as Array<{enrolment_id:string;subject_offering_id:string}>;
  const rows:Array<{enrolment_id:string;subject_offering_id:string}>=[];
  const pageSize=1000;
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await db.from("learner_subject_registrations")
      .select("enrolment_id,subject_offering_id")
      .eq("school_id",schoolId)
      .eq("academic_year",academicYear)
      .eq("status","active")
      .in("enrolment_id",enrolmentIds)
      .range(offset,offset+pageSize-1);
    if(error) throw new Error("Unable to load governed learner subject registrations.");
    const batch=(data??[]) as Array<{enrolment_id:string;subject_offering_id:string}>;
    rows.push(...batch);
    if(batch.length<pageSize) break;
  }
  return rows;
}

async function loadAbsences(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId:string,
  enrolmentIds:string[],
  startsOn:string|null,
  endsOn:string|null,
) {
  if(!enrolmentIds.length||!startsOn||!endsOn) return [] as Array<{enrolment_id:string;attendance_date:string}>;
  const rows:Array<{enrolment_id:string;attendance_date:string}>=[];
  const pageSize=1000;
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await db.from("daily_register_current")
      .select("enrolment_id,attendance_date")
      .eq("school_id",schoolId)
      .in("enrolment_id",enrolmentIds)
      .eq("status","absent")
      .gte("attendance_date",startsOn)
      .lte("attendance_date",endsOn)
      .range(offset,offset+pageSize-1);
    if(error) throw new Error("Unable to load governed attendance evidence.");
    const batch=(data??[]).map((row)=>({enrolment_id:String(row.enrolment_id),attendance_date:String(row.attendance_date)}));
    rows.push(...batch);
    if(batch.length<pageSize) break;
  }
  return rows;
}

async function buildOfficialDocument(input: {
  schoolId: string;
  academicYear: number;
  termNumber: number;
  basis: AcademicScheduleBasis;
  scheduleType: "term_schedule" | "promotion_schedule" | "promotion_all_terms";
  gradeId: string;
  classIds?: string[];
}): Promise<AcademicSchedulePayload> {
  const db=await createSupabaseServerClient();
  const allTerms=input.scheduleType==="promotion_all_terms";
  const [{data:academicYearRow},{data:gradeRow,error:gradeError},{data:classRows,error:classError}]=await Promise.all([
    db.from("academic_years").select("id,starts_on,ends_on").eq("school_id",input.schoolId).eq("year",input.academicYear).maybeSingle(),
    db.from("grades").select("id,grade_code,display_name").eq("school_id",input.schoolId).eq("academic_year",input.academicYear).eq("id",input.gradeId).maybeSingle(),
    db.from("register_classes").select("id,grade_id,class_code,display_name").eq("school_id",input.schoolId).eq("academic_year",input.academicYear).eq("grade_id",input.gradeId),
  ]);
  if(gradeError||classError||!gradeRow) throw new Error("Choose a valid grade for this school and academic year.");

  const canonicalClasses=(classRows??[]).map((row)=>({id:String(row.id),label:String(row.display_name),code:String(row.class_code)}));
  const selectedClassIds=[...new Set((input.classIds??[]).map((value)=>value.trim()).filter(Boolean))].sort();
  if(selectedClassIds.some((value)=>!canonicalClasses.some((row)=>row.id===value))) throw new Error("Choose valid classes for the selected grade.");
  const selectedClassNames=selectedClassIds.length
    ? canonicalClasses.filter((row)=>selectedClassIds.includes(row.id)).map((row)=>row.label).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
    : [];

  const {data:termRows,error:termError}=academicYearRow?.id
    ? await db.from("academic_terms").select("term_number,display_name,starts_on,ends_on").eq("academic_year_id",academicYearRow.id).order("term_number")
    : {data:[],error:null};
  if(termError) throw new Error("Unable to resolve governed academic terms.");
  const configuredTerms=(termRows??[]).map((row)=>({
    number:Number(row.term_number),
    label:String(row.display_name),
    startsOn:row.starts_on?String(row.starts_on):null,
    endsOn:row.ends_on?String(row.ends_on):null,
  }));
  const selectedTerm=configuredTerms.find((term)=>term.number===input.termNumber);
  const termNumbers=allTerms?(configuredTerms.length?configuredTerms.map((term)=>term.number):[input.termNumber]):[input.termNumber];
  const periodStart=allTerms?(configuredTerms[0]?.startsOn??academicYearRow?.starts_on??null):(selectedTerm?.startsOn??null);
  const periodEnd=allTerms?(configuredTerms.at(-1)?.endsOn??academicYearRow?.ends_on??null):(selectedTerm?.endsOn??null);
  const yearStart=academicYearRow?.starts_on??configuredTerms[0]?.startsOn??null;
  const yearEnd=academicYearRow?.ends_on??configuredTerms.at(-1)?.endsOn??null;
  const datedScopeReady=Boolean(periodStart&&periodEnd);

  let gradeEnrolments:Array<{
    id:string;learner_id:string;admission_number:string|null;grade_id:string|null;register_class_id:string|null;
    enrolled_from:string;enrolled_to:string|null;
    learners:{first_names:string;surname:string;date_of_birth:string|null;sex:string|null}|Array<{first_names:string;surname:string;date_of_birth:string|null;sex:string|null}>|null;
    grades:{display_name:string}|Array<{display_name:string}>|null;
    register_classes:{display_name:string}|Array<{display_name:string}>|null;
  }>=[];
  if(datedScopeReady){
    let query=db.from("enrolments")
      .select("id,learner_id,admission_number,grade_id,register_class_id,enrolled_from,enrolled_to,learners!inner(first_names,surname,date_of_birth,sex),grades(display_name),register_classes(display_name)")
      .eq("school_id",input.schoolId)
      .eq("academic_year",input.academicYear)
      .eq("grade_id",input.gradeId)
      .lte("enrolled_from",periodEnd as string);
    query=query.or("enrolled_to.is.null,enrolled_to.gte."+periodStart);
    const {data,error}=await query;
    if(error) throw new Error("Unable to load the governed schedule learner cohort.");
    gradeEnrolments=(data??[]) as unknown as typeof gradeEnrolments;
  }
  const gradeEnrolmentIds=gradeEnrolments.map((row)=>row.id);
  const outputEnrolments=gradeEnrolments.filter((row)=>!selectedClassIds.length||(row.register_class_id&&selectedClassIds.includes(row.register_class_id)));
  const outputEnrolmentIds=outputEnrolments.map((row)=>row.id);
  const outputEnrolmentSet=new Set(outputEnrolmentIds);

  const results=input.basis==="official"
    ? await loadAllOfficialResults(db,input.schoolId,input.academicYear,termNumbers,gradeEnrolmentIds)
    : [];
  const outputResultRows=results.filter((row)=>outputEnrolmentSet.has(row.enrolment_id));
  const resultOfferingIds=[...new Set(outputResultRows.map((row)=>row.subject_offering_id))];
  const registrations=await loadActiveRegistrations(db,input.schoolId,input.academicYear,outputEnrolmentIds);
  const registeredOfferingIds=[...new Set(registrations.map((row)=>row.subject_offering_id))];

  const {data:activeOfferingRows,error:offeringError}=await db.from("subject_offerings")
    .select("id,subject_id,status,subjects(display_name,subject_code)")
    .eq("school_id",input.schoolId)
    .eq("academic_year",input.academicYear)
    .eq("grade_id",input.gradeId)
    .eq("status","active");
  if(offeringError) throw new Error("Unable to load governed active subject offerings.");
  let offeringRows=(activeOfferingRows??[]) as unknown as Array<{
    id:string;subject_id:string;status:string;
    subjects:{display_name:string;subject_code:string|null}|Array<{display_name:string;subject_code:string|null}>|null;
  }>;
  const missingResultOfferings=resultOfferingIds.filter((offeringId)=>!offeringRows.some((row)=>row.id===offeringId));
  if(missingResultOfferings.length){
    const {data:historicalOfferings,error}=await db.from("subject_offerings")
      .select("id,subject_id,status,subjects(display_name,subject_code)")
      .eq("school_id",input.schoolId)
      .eq("academic_year",input.academicYear)
      .eq("grade_id",input.gradeId)
      .in("id",missingResultOfferings);
    if(error) throw new Error("Unable to resolve historical result subject offerings.");
    offeringRows=[...offeringRows,...((historicalOfferings??[]) as unknown as typeof offeringRows)];
  }

  const allowedOfferingIds=new Set<string>(
    registeredOfferingIds.length
      ? [...registeredOfferingIds,...resultOfferingIds]
      : [...offeringRows.filter((row)=>row.status==="active").map((row)=>row.id),...resultOfferingIds],
  );
  const selectedOfferings=offeringRows.filter((row)=>allowedOfferingIds.has(row.id)).sort((a,b)=>{
    const aa=relation(a.subjects);
    const bb=relation(b.subjects);
    return String(aa?.display_name??aa?.subject_code??"").localeCompare(String(bb?.display_name??bb?.subject_code??""),undefined,{numeric:true});
  });
  const offeringMap=new Map(selectedOfferings.map((row)=>[row.id,relation(row.subjects)]));
  const subjects=selectedOfferings.map((row)=>{
    const subject=relation(row.subjects);
    return {
      key:String(row.id),
      name:String(subject?.display_name??subject?.subject_code??"Subject"),
      code:subject?.subject_code?String(subject.subject_code):null,
      maximumMark:null as number|null,
      minimumPassMark:null as number|null,
      minimumPassMarkSource:null as "promotion_rule"|"grading_scale"|null,
    };
  });

  const displayResults=outputResultRows.filter((row)=>allowedOfferingIds.has(row.subject_offering_id));
  const scaleRefs=[...new Set(displayResults.filter((row)=>row.grading_scale_key&&row.grading_scale_version).map((row)=>String(row.grading_scale_key)+"::"+String(row.grading_scale_version)))];
  const {data:scales,error:scaleError}=scaleRefs.length
    ? await db.from("grading_scales").select("id,scale_key,version").eq("school_id",input.schoolId)
    : {data:[],error:null};
  if(scaleError) throw new Error("Unable to resolve governed grading scales.");
  const scaleIds=(scales??[]).filter((scale)=>scaleRefs.includes(String(scale.scale_key)+"::"+String(scale.version))).map((scale)=>scale.id);
  const {data:bands,error:bandError}=scaleIds.length
    ? await db.from("grading_scale_bands").select("grading_scale_id,minimum_value,maximum_value,pass_classification").in("grading_scale_id",scaleIds)
    : {data:[],error:null};
  if(bandError) throw new Error("Unable to resolve governed grading-scale bands.");
  const scaleByRef=new Map((scales??[]).map((scale)=>[String(scale.scale_key)+"::"+String(scale.version),scale.id]));

  const {data:ruleSets,error:ruleSetError}=await db.from("promotion_rule_sets")
    .select("id,result_term_number,rule_set_key,version")
    .eq("school_id",input.schoolId)
    .eq("academic_year",input.academicYear)
    .eq("grade_id",input.gradeId)
    .eq("status","active");
  if(ruleSetError) throw new Error("Unable to resolve governed promotion rule sets.");
  const applicableRuleSets=(ruleSets??[]).filter((row)=>Number(row.result_term_number)===input.termNumber);
  const ruleSetIds=applicableRuleSets.map((row)=>row.id);
  const {data:ruleConditions,error:ruleConditionError}=ruleSetIds.length
    ? await db.from("promotion_rule_conditions")
        .select("promotion_rule_set_id,condition_type,subject_code,threshold,required")
        .in("promotion_rule_set_id",ruleSetIds)
        .eq("condition_type","minimum_subject_result")
        .eq("required",true)
    : {data:[],error:null};
  if(ruleConditionError) throw new Error("Unable to resolve governed promotion-subject thresholds.");

  for(const subject of subjects){
    const thresholds=(ruleConditions??[])
      .filter((condition)=>condition.subject_code&&subject.code&&String(condition.subject_code).toUpperCase()===subject.code.toUpperCase())
      .map((condition)=>Number(condition.threshold))
      .filter(Number.isFinite);
    const unique=[...new Set(thresholds)];
    if(unique.length===1){
      subject.minimumPassMark=unique[0];
      subject.minimumPassMarkSource="promotion_rule";
    }
  }
  for(const subject of subjects){
    const subjectScaleRefs=[...new Set(
      displayResults
        .filter((row)=>row.subject_offering_id===subject.key&&row.grading_scale_key&&row.grading_scale_version)
        .map((row)=>String(row.grading_scale_key)+"::"+String(row.grading_scale_version)),
    )];
    const scaleId=subjectScaleRefs.length===1?scaleByRef.get(subjectScaleRefs[0]):null;
    const scaleBands=(bands??[]).filter((band)=>band.grading_scale_id===scaleId);
    const passMinimums=scaleBands.filter((band)=>band.pass_classification==="pass").map((band)=>Number(band.minimum_value)).filter(Number.isFinite);
    const maxima=scaleBands.map((band)=>band.maximum_value==null?null:Number(band.maximum_value));
    if(subject.minimumPassMark==null&&subjectScaleRefs.length===1&&passMinimums.length){
      subject.minimumPassMark=Math.min(...passMinimums);
      subject.minimumPassMarkSource="grading_scale";
    }
    subject.maximumMark=subjectScaleRefs.length===1&&maxima.length&&maxima.every((maximum):maximum is number=>maximum!=null&&Number.isFinite(maximum))
      ? Math.max(...maxima)
      : null;
  }

  const promotionMark=(result:ResultRow|undefined,subject:(typeof subjects)[number]):string|number|null=>{
    if(!result) return "";
    if(result.result_value==null) return result.result_status??"";
    const numeric=Number(result.result_value);
    if(subject.minimumPassMark!=null&&Number.isFinite(numeric)&&numeric<subject.minimumPassMark){
      return String(result.result_value)+"*";
    }
    return result.result_value;
  };

  const {data:progressions,error:progressionError}=gradeEnrolmentIds.length
    ? await db.from("year_end_progressions")
        .select("enrolment_id,outcome,recommended_outcome,status,rule_set_key,rule_set_version,override_reason")
        .eq("school_id",input.schoolId)
        .eq("academic_year",input.academicYear)
        .in("enrolment_id",gradeEnrolmentIds)
    : {data:[],error:null};
  if(progressionError) throw new Error("Unable to load governed progression decisions.");
  const progressionMap=new Map((progressions??[]).map((row)=>[String(row.enrolment_id),row]));

  const absenceRows=await loadAbsences(db,input.schoolId,outputEnrolmentIds,yearStart,yearEnd);
  const yearAbsences=distinctAbsenceCounts(absenceRows,yearStart,yearEnd);
  const termAbsences=new Map<number,Map<string,number>>();
  for(const term of configuredTerms) termAbsences.set(term.number,distinctAbsenceCounts(absenceRows,term.startsOn,term.endsOn));
  const selectedTermAbsences=distinctAbsenceCounts(absenceRows,selectedTerm?.startsOn,selectedTerm?.endsOn);

  const resultsByLearner=new Map<string,ResultRow[]>();
  for(const result of results) resultsByLearner.set(result.enrolment_id,[...(resultsByLearner.get(result.enrolment_id)??[]),result]);

  const {data:readinessRows,error:readinessError}=input.basis==="official"
    ? await db.rpc("get_academic_analysis_promotion_readiness",{p_school_id:input.schoolId,p_academic_year:input.academicYear})
    : {data:[],error:null};
  if(readinessError) throw new Error("Unable to load canonical promotion readiness.");
  const readinessByEnrolment=new Map<string,{recommendedOutcome:string|null}>();
  for(const row of (readinessRows??[]) as Array<Record<string,unknown>>){
    readinessByEnrolment.set(String(row.enrolment_id),{recommendedOutcome:row.recommended_outcome?String(row.recommended_outcome):null});
  }

  const averageByTerm=new Map<number,Map<string,number|null>>();
  const rankByTerm=new Map<number,Map<string,number>>();
  for(const termNumber of termNumbers){
    const averages=gradeEnrolments.map((enrolment)=>{
      const values=(resultsByLearner.get(enrolment.id)??[])
        .filter((row)=>row.term_number===termNumber&&row.result_value!=null)
        .map((row)=>Number(row.result_value))
        .filter(Number.isFinite);
      return {id:enrolment.id,average:roundedAverage(values)};
    });
    averageByTerm.set(termNumber,new Map(averages.map((item)=>[item.id,item.average])));
    rankByTerm.set(termNumber,competitionRanks(averages));
  }
  const currentAverages=averageByTerm.get(input.termNumber)??new Map<string,number|null>();
  const currentRanks=rankByTerm.get(input.termNumber)??new Map<string,number>();

  const sortedOutput=[...outputEnrolments].sort((a,b)=>{
    const classA=relation(a.register_classes)?.display_name??"";
    const classB=relation(b.register_classes)?.display_name??"";
    const learnerA=relation(a.learners);
    const learnerB=relation(b.learners);
    return classA.localeCompare(classB,undefined,{numeric:true})
      || String(learnerA?.surname??"").localeCompare(String(learnerB?.surname??""))
      || String(learnerA?.first_names??"").localeCompare(String(learnerB?.first_names??""));
  });

  const reportDate=selectedTerm?.endsOn??periodEnd??yearEnd??new Date().toISOString().slice(0,10);
  const rows:Array<Record<string,string|number|null>>=[];
  sortedOutput.forEach((enrolment,learnerIndex)=>{
    const learner=relation(enrolment.learners);
    const learnerResults=resultsByLearner.get(enrolment.id)??[];
    const common:Record<string,string|number|null>=input.scheduleType==="term_schedule"
      ? {
          "No.":learnerIndex+1,
          "Admission Number":enrolment.admission_number??"",
          Student:[learner?.surname,learner?.first_names].filter(Boolean).join(", "),
          "Home Language":"",
          "Birth Date":learner?.date_of_birth??"",
          Age:ageOn(learner?.date_of_birth,String(reportDate)),
          "Days Absent":selectedTermAbsences.get(enrolment.id)??0,
          Gender:sexCode(learner?.sex),
          "Years in Grade":"",
          "Years in Phase":"",
        }
      : {
          "No.":learnerIndex+1,
          Learner:[learner?.surname,learner?.first_names].filter(Boolean).join(", "),
          Sex:sexCode(learner?.sex),
          DOB:learner?.date_of_birth??"",
          "Average %":currentAverages.get(enrolment.id)??null,
          Rank:currentRanks.get(enrolment.id)??null,
        };

    if(allTerms){
      for(const term of configuredTerms){
        const termResults=learnerResults.filter((row)=>row.term_number===term.number);
        const cycle:Record<string,string|number|null>={
          ...common,
          "Average %":averageByTerm.get(term.number)?.get(enrolment.id)??null,
          Rank:rankByTerm.get(term.number)?.get(enrolment.id)??null,
          Cycle:term.label,
        };
        for(const subject of subjects){
          const result=termResults.find((row)=>row.subject_offering_id===subject.key);
          cycle[subject.name]=promotionMark(result,subject);
        }
        cycle["Days Absent"]=termAbsences.get(term.number)?.get(enrolment.id)??0;
        cycle["Years in Phase"]="";
        cycle.Recommendation="";
        cycle.Ruling="";
        cycle.Remarks="";
        rows.push(cycle);
      }
      const progression=progressionMap.get(enrolment.id);
      const finalDecision=progression&&["approved","locked"].includes(String(progression.status))?String(progression.outcome):"";
      const promotion:Record<string,string|number|null>={
        ...common,
        Cycle:"Promotion",
        "Days Absent":yearAbsences.get(enrolment.id)??0,
        "Years in Phase":"",
        Recommendation:readinessByEnrolment.get(enrolment.id)?.recommendedOutcome??"",
        Ruling:finalDecision,
        Remarks:"",
      };
      for(const subject of subjects) promotion[subject.name]="";
      rows.push(promotion);
      return;
    }

    const base:Record<string,string|number|null>={...common};
    for(const subject of subjects){
      const result=learnerResults.find((row)=>row.term_number===input.termNumber&&row.subject_offering_id===subject.key);
      if(input.scheduleType==="term_schedule"){
        base[subject.name+" Symbol"]=result?.symbol??"";
        base[subject.name+" Mark"]=result?.result_value??result?.result_status??"";
      }else{
        base[subject.name]=promotionMark(result,subject);
      }
    }
    if(input.scheduleType==="term_schedule"){
      base["Overall %"]=currentAverages.get(enrolment.id)??null;
      base["Support comments"]="";
    }else{
      const progression=progressionMap.get(enrolment.id);
      base["Days Absent"]=selectedTermAbsences.get(enrolment.id)??0;
      base["Years in Phase"]="";
      base.Recommendation=readinessByEnrolment.get(enrolment.id)?.recommendedOutcome??"";
      base.Ruling=progression&&["approved","locked"].includes(String(progression.status))?String(progression.outcome):"";
      base.Remarks="";
    }
    rows.push(base);
  });

  const columns=input.scheduleType==="term_schedule"
    ? ["No.","Admission Number","Student","Home Language","Birth Date","Age","Days Absent","Gender","Years in Grade","Years in Phase",...subjects.flatMap((subject)=>[subject.name+" Symbol",subject.name+" Mark"]),"Overall %","Support comments"]
    : ["No.","Learner","Sex","DOB","Average %","Rank",...(allTerms?["Cycle"]:[]),...subjects.map((subject)=>subject.name),"Days Absent","Years in Phase","Recommendation","Ruling","Remarks"];

  const outputResults=displayResults;
  const footerRows=input.scheduleType==="term_schedule"?[]:[
    Object.fromEntries(columns.map((column)=>[column,column==="Learner"?"Maximum Mark":subjects.find((subject)=>subject.name===column)?.maximumMark??""])),
    Object.fromEntries(columns.map((column)=>[column,column==="Learner"?"Minimum Promotion Mark":subjects.find((subject)=>subject.name===column)?.minimumPassMark??""])),
    Object.fromEntries(columns.map((column)=>[column,column==="Learner"?"Total Mark":subjects.some((subject)=>subject.name===column)?outputResults.filter((result)=>offeringMap.get(result.subject_offering_id)?.display_name===column&&result.result_value!=null).reduce((sum,result)=>sum+Number(result.result_value),0):""])),
    Object.fromEntries(columns.map((column)=>[column,column==="Learner"?"Total Learners":subjects.some((subject)=>subject.name===column)?new Set(outputResults.filter((result)=>offeringMap.get(result.subject_offering_id)?.display_name===column&&result.result_value!=null).map((result)=>result.enrolment_id)).size:""])),
    Object.fromEntries(columns.map((column)=>[column,column==="Learner"?"Class Average":subjects.some((subject)=>subject.name===column)?roundedAverage(outputResults.filter((result)=>offeringMap.get(result.subject_offering_id)?.display_name===column&&result.result_value!=null).map((result)=>Number(result.result_value)).filter(Number.isFinite))??"":""])),
  ];

  const finalProgression=(enrolmentId:string)=>{
    const row=progressionMap.get(enrolmentId);
    return row&&["approved","locked"].includes(String(row.status))?row:null;
  };
  const canonicalOutcome=(outcome:string,label:string)=>{
    const cohort=outputEnrolments.filter((enrolment)=>String(finalProgression(enrolment.id)?.outcome??"")===outcome);
    return {
      outcome:label,
      female:cohort.filter((row)=>relation(row.learners)?.sex==="female").length,
      male:cohort.filter((row)=>relation(row.learners)?.sex==="male").length,
      total:cohort.length,
    };
  };
  const outcomeAnalysis:Array<{outcome:string;female:number|null;male:number|null;total:number|null}>=[
    canonicalOutcome("condoned","Condoned"),
    canonicalOutcome("not_promoted","Not Promoted"),
    {outcome:"Pass",female:null,male:null,total:null},
    canonicalOutcome("promoted","Promoted"),
    canonicalOutcome("transferred","Transferred"),
  ];

  const promotionThresholdCount=subjects.filter((subject)=>subject.minimumPassMarkSource==="promotion_rule").length;
  const gradingThresholdCount=subjects.filter((subject)=>subject.minimumPassMarkSource==="grading_scale").length;
  const missingThresholdCount=subjects.filter((subject)=>subject.minimumPassMark==null).length;
  const sourceReadiness:AcademicScheduleSourceReadiness[]=[
    {label:"Learner roster",status:datedScopeReady?"available":"unavailable",detail:datedScopeReady?String(outputEnrolments.length)+" governed enrolment"+(outputEnrolments.length===1?"":"s"):"Academic period dates are not configured"},
    {label:"Official results",status:input.basis==="official"?(results.length?"available":"partial"):"unavailable",detail:input.basis==="official"?String(results.length)+" current governed result record"+(results.length===1?"":"s"):"No official result is substituted into provisional preview"},
    {label:"Subjects",status:subjects.length?"available":"partial",detail:String(subjects.length)+" governed subject offering"+(subjects.length===1?"":"s")+" in scope"},
    {label:"Promotion thresholds",status:missingThresholdCount?((promotionThresholdCount||gradingThresholdCount)?"partial":"unavailable"):"available",detail:String(promotionThresholdCount)+" promotion-rule · "+String(gradingThresholdCount)+" grading-scale fallback · "+String(missingThresholdCount)+" unavailable"},
    {label:"Attendance",status:yearStart&&yearEnd?"available":"partial",detail:yearStart&&yearEnd?"Distinct governed absence dates":"Academic-year dates incomplete"},
    {label:"Optional source fields",status:"unavailable",detail:"Home language, years-in-grade/phase, support comments, remarks and signatures stay blank when not canonical"},
  ];

  return {
    scheduleType:input.scheduleType,
    title:ACADEMIC_SCHEDULE_LABELS[input.scheduleType],
    basis:input.basis,
    academicYear:input.academicYear,
    termNumber:input.termNumber,
    scopeKey:academicScheduleScopeKey({period:allTerms?"all_terms":"term",gradeId:input.gradeId,classIds:selectedClassIds}),
    period:allTerms?"all_terms":"term",
    periodLabel:allTerms?"All Terms":selectedTerm?.label??("Term "+input.termNumber),
    gradeId:String(gradeRow.id),
    grade:String(gradeRow.display_name),
    classIds:selectedClassIds,
    classNames:selectedClassNames,
    generatedAt:new Date().toISOString(),
    sourceDescription:input.basis==="official"
      ? "Supplied-source fidelity: Namibia promotion schedules and Generic Mark Schedule; populated from official_results_current, canonical enrolment/learner, attendance, active subject registrations/offerings, grading and governed promotion sources."
      : "Provisional preview is intentionally blank where no canonical per-learner provisional schedule matrix is available; official rows are never relabelled as provisional.",
    sourceReadiness,
    columns,
    rows,
    rowCount:rows.length,
    subjects,
    footerRows,
    outcomeAnalysis,
    notes:[
      "Blank home language, support comments, years-in-grade/phase, remarks, signatures and unapproved rulings are intentional where no canonical governed source exists.",
      "Minimum Promotion Mark prefers an active governed promotion-rule subject threshold; a grading-scale pass boundary is used only as a governed fallback.",
      "Rank is competition rank across the full selected grade cohort; equal averages share rank and the next position is skipped.",
      "The source-required Pass analysis row is intentionally blank because year_end_progressions has no unambiguous canonical pass outcome.",
      ...(input.basis==="provisional"?["No official result is substituted into this provisional preview."]:[]),
    ],
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
  gradeId?: string;
  classIds?: string[];
}): Promise<AcademicSchedulePayload | null> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length || !context.currentSchoolMembership) return null;
  const membership = context.currentSchoolMembership;
  if (!managerRole(membership.roleKey)) return null;

  if (["term_schedule","promotion_schedule","promotion_all_terms"].includes(input.scheduleType)) {
    if(!input.gradeId) throw new Error("Choose a grade before generating an official academic schedule.");
    return buildOfficialDocument({
      academicYear:input.academicYear,
      termNumber:input.termNumber,
      basis:input.basis,
      scheduleType:input.scheduleType as "term_schedule"|"promotion_schedule"|"promotion_all_terms",
      gradeId:input.gradeId,
      classIds:input.classIds,
      schoolId:membership.schoolId,
    });
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
    .eq("scope_key",input.scopeKey ?? academicScheduleScopeKey({period:"term",gradeId:"legacy-analysis"}))
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

function normalizeFrozenAcademicSchedulePayload(
  value: unknown,
  row: {
    academic_year: number;
    term_number: number;
    schedule_type: string;
    basis: string;
    title: string;
    scope_key: string;
    generated_at: string;
  },
): AcademicSchedulePayload {
  const raw=value && typeof value==="object" && !Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
  const scheduleType=ACADEMIC_SCHEDULE_TYPES.includes(raw.scheduleType as AcademicScheduleType)
    ? raw.scheduleType as AcademicScheduleType
    : row.schedule_type as AcademicScheduleType;
  const period:AcademicSchedulePayload["period"]=raw.period==="all_terms"||scheduleType==="promotion_all_terms"
    ? "all_terms"
    : "term";
  const termNumber=Number.isInteger(Number(raw.termNumber))?Number(raw.termNumber):Number(row.term_number);
  const academicYear=Number.isInteger(Number(raw.academicYear))?Number(raw.academicYear):Number(row.academic_year);
  const columns=Array.isArray(raw.columns)?raw.columns.filter((item):item is string=>typeof item==="string"):[];
  const rows=Array.isArray(raw.rows)
    ? raw.rows.filter((item):item is Record<string,string|number|null>=>Boolean(item)&&typeof item==="object"&&!Array.isArray(item))
    : [];
  const classNames=Array.isArray(raw.classNames)?raw.classNames.filter((item):item is string=>typeof item==="string"):[];
  const classIds=Array.isArray(raw.classIds)?raw.classIds.filter((item):item is string=>typeof item==="string"):[];
  const notes=Array.isArray(raw.notes)?raw.notes.filter((item):item is string=>typeof item==="string"):[];
  const generatedAt=typeof raw.generatedAt==="string"&&raw.generatedAt?raw.generatedAt:String(row.generated_at);
  const sourceDescription=typeof raw.sourceDescription==="string"&&raw.sourceDescription
    ? raw.sourceDescription
    : "Frozen governed academic schedule snapshot.";
  const rowCount=Number.isInteger(Number(raw.rowCount))?Number(raw.rowCount):rows.length;

  return {
    ...(raw as Partial<AcademicSchedulePayload>),
    scheduleType,
    title:typeof raw.title==="string"&&raw.title?raw.title:String(row.title),
    basis:raw.basis==="provisional"?"provisional":row.basis==="provisional"?"provisional":"official",
    academicYear,
    termNumber,
    scopeKey:typeof raw.scopeKey==="string"&&raw.scopeKey?raw.scopeKey:String(row.scope_key),
    period,
    periodLabel:typeof raw.periodLabel==="string"&&raw.periodLabel
      ? raw.periodLabel
      : period==="all_terms"?"All Terms":"Term "+termNumber,
    gradeId:typeof raw.gradeId==="string"&&raw.gradeId?raw.gradeId:null,
    grade:typeof raw.grade==="string"&&raw.grade?raw.grade:null,
    classIds,
    classNames,
    generatedAt,
    sourceDescription,
    columns,
    rows,
    rowCount,
    notes,
    subjects:Array.isArray(raw.subjects)?raw.subjects as AcademicSchedulePayload["subjects"]:undefined,
    footerRows:Array.isArray(raw.footerRows)?raw.footerRows as AcademicSchedulePayload["footerRows"]:undefined,
    outcomeAnalysis:Array.isArray(raw.outcomeAnalysis)?raw.outcomeAnalysis as AcademicSchedulePayload["outcomeAnalysis"]:undefined,
    sourceReadiness:Array.isArray(raw.sourceReadiness)?raw.sourceReadiness as AcademicSchedulePayload["sourceReadiness"]:undefined,
  };
}

export async function getAcademicScheduleSnapshot(snapshotId: string): Promise<AcademicScheduleSnapshot | null> {
  const context = await getUserContext();
  if (!context.user || !context.currentSchoolMembership || !managerRole(context.currentSchoolMembership.roleKey)) return null;
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("academic_schedule_snapshots")
    .select("id,school_id,academic_year,term_number,schedule_type,basis,title,scope_key,version,status,payload,metadata,generated_at,finalized_at,supersession_reason")
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
    payload:normalizeFrozenAcademicSchedulePayload(data.payload,{
      academic_year:Number(data.academic_year),
      term_number:Number(data.term_number),
      schedule_type:String(data.schedule_type),
      basis:String(data.basis),
      title:String(data.title),
      scope_key:String(data.scope_key),
      generated_at:String(data.generated_at),
    }),
    header,
    version:Number(data.version),
    status:String(data.status) as AcademicScheduleSnapshot["status"],
    supersessionReason:data.supersession_reason ? String(data.supersession_reason) : null,
    finalizedAt:String(data.finalized_at),
  };
}
