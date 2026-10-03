import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AssessmentQualityRow = {
  assessmentInstanceId: string;
  assessmentSchemeId: string;
  captureMode: "detailed" | "final_result";
  assessmentComponentId: string | null;
  componentName: string | null;
  componentType: string;
  componentCategory: "ca" | "exam" | "final_result";
  componentRequired: boolean;
  moderationRequired: boolean;
  subjectOfferingId: string;
  subjectId: string;
  subjectName: string;
  gradeName: string;
  registerClassId: string;
  className: string;
  teacherStaffMemberId: string | null;
  teacherName: string | null;
  termNumber: number | null;
  instanceStatus: string;
  readinessStatus: "draft" | "submitted" | "returned" | "verified" | "locked" | "cancelled";
  expectedLearners: number;
  capturedRecords: number;
  numericRecords: number;
  statusRecords: number;
  missingRequiredRecords: number;
  completionPercent: number | null;
  averagePercent: number | null;
  medianPercent: number | null;
  highPercent: number | null;
  lowPercent: number | null;
  markStatusCounts: Record<string, number>;
  analysisStatus: "component_analysis" | "no_numeric_marks" | "final_result_only";
};

export type AssessmentQualityGap = {
  key: string;
  subjectName: string;
  className: string;
  teacherName: string | null;
  caAverage: number;
  examAverage: number;
  examMinusCa: number;
};

export type AssessmentQualityWorkspace = {
  schoolId: string;
  academicYear: number;
  termNumber: number | null;
  scopeLabel: string;
  rows: AssessmentQualityRow[];
  gaps: AssessmentQualityGap[];
  summary: {
    instances: number;
    detailedInstances: number;
    finalResultOnlyInstances: number;
    expectedRequiredRecords: number;
    capturedRequiredRecords: number;
    missingRequiredRecords: number;
    completionPercent: number | null;
    readiness: Record<string, number>;
  };
  options: {
    subjects: Array<{ value: string; label: string }>;
    classes: Array<{ value: string; label: string }>;
    teachers: Array<{ value: string; label: string }>;
  };
};

type QualityParams = {
  academicYear: number;
  termNumber?: number | null;
  subjectOfferingId?: string;
  registerClassId?: string;
  teacherStaffMemberId?: string;
  readiness?: string;
};

function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function weightedCategoryAverage(rows: AssessmentQualityRow[], category: "ca" | "exam") {
  const usable=rows.filter((row)=>row.componentCategory===category && row.averagePercent!==null && row.numericRecords>0);
  const weight=usable.reduce((sum,row)=>sum+row.numericRecords,0);
  if (!weight) return null;
  return usable.reduce((sum,row)=>sum+(row.averagePercent ?? 0)*row.numericRecords,0)/weight;
}

export async function getAssessmentQualityWorkspace(params: QualityParams): Promise<AssessmentQualityWorkspace | null> {
  const context=await getUserContext();
  if (!context.user || context.platformMemberships.length || !context.currentSchoolMembership) return null;
  const membership=context.currentSchoolMembership;
  if (!["school_admin","principal","deputy_principal","hod","teacher","class_teacher"].includes(membership.roleKey)) return null;

  const db=await createSupabaseServerClient();
  const { data, error }=await db.rpc("get_assessment_quality_readiness",{
    p_school_id:membership.schoolId,
    p_academic_year:params.academicYear,
    p_term_number:params.termNumber ?? null,
  });
  if (error) throw new Error("Unable to load assessment quality/readiness data.");

  const allRows=((data ?? []) as Array<Record<string,unknown>>).map((row):AssessmentQualityRow=>({
    assessmentInstanceId:String(row.assessment_instance_id),
    assessmentSchemeId:String(row.assessment_scheme_id),
    captureMode:String(row.capture_mode) as AssessmentQualityRow["captureMode"],
    assessmentComponentId:row.assessment_component_id ? String(row.assessment_component_id) : null,
    componentName:row.component_name ? String(row.component_name) : null,
    componentType:String(row.component_type),
    componentCategory:String(row.component_category) as AssessmentQualityRow["componentCategory"],
    componentRequired:Boolean(row.component_required),
    moderationRequired:Boolean(row.moderation_required),
    subjectOfferingId:String(row.subject_offering_id),
    subjectId:String(row.subject_id),
    subjectName:String(row.subject_name),
    gradeName:String(row.grade_name),
    registerClassId:String(row.register_class_id),
    className:String(row.class_name),
    teacherStaffMemberId:row.teacher_staff_member_id ? String(row.teacher_staff_member_id) : null,
    teacherName:row.teacher_name ? String(row.teacher_name) : null,
    termNumber:row.term_number == null ? null : Number(row.term_number),
    instanceStatus:String(row.instance_status),
    readinessStatus:String(row.readiness_status) as AssessmentQualityRow["readinessStatus"],
    expectedLearners:Number(row.expected_learners ?? 0),
    capturedRecords:Number(row.captured_records ?? 0),
    numericRecords:Number(row.numeric_records ?? 0),
    statusRecords:Number(row.status_records ?? 0),
    missingRequiredRecords:Number(row.missing_required_records ?? 0),
    completionPercent:numberOrNull(row.completion_percent),
    averagePercent:numberOrNull(row.average_percent),
    medianPercent:numberOrNull(row.median_percent),
    highPercent:numberOrNull(row.high_percent),
    lowPercent:numberOrNull(row.low_percent),
    markStatusCounts:(row.mark_status_counts && typeof row.mark_status_counts==="object" ? row.mark_status_counts : {}) as Record<string,number>,
    analysisStatus:String(row.analysis_status) as AssessmentQualityRow["analysisStatus"],
  }));

  const options={
    subjects:[...new Map(allRows.map((row)=>[row.subjectOfferingId,{value:row.subjectOfferingId,label:`${row.subjectName} · ${row.gradeName}`}])).values()].sort((a,b)=>a.label.localeCompare(b.label)),
    classes:[...new Map(allRows.map((row)=>[row.registerClassId,{value:row.registerClassId,label:row.className}])).values()].sort((a,b)=>a.label.localeCompare(b.label)),
    teachers:[...new Map(allRows.filter((row)=>row.teacherStaffMemberId).map((row)=>[row.teacherStaffMemberId!,{value:row.teacherStaffMemberId!,label:row.teacherName ?? "Teacher"}])).values()].sort((a,b)=>a.label.localeCompare(b.label)),
  };

  const rows=allRows.filter((row)=>{
    if (params.subjectOfferingId && row.subjectOfferingId!==params.subjectOfferingId) return false;
    if (params.registerClassId && row.registerClassId!==params.registerClassId) return false;
    if (params.teacherStaffMemberId && row.teacherStaffMemberId!==params.teacherStaffMemberId) return false;
    if (params.readiness && row.readinessStatus!==params.readiness) return false;
    return true;
  });

  const readiness:Record<string,number>={draft:0,submitted:0,returned:0,verified:0,locked:0,cancelled:0};
  for(const row of rows) readiness[row.readinessStatus]=(readiness[row.readinessStatus] ?? 0)+1;

  const required=rows.filter((row)=>row.captureMode==="detailed" && row.componentRequired);
  const expectedRequiredRecords=required.reduce((sum,row)=>sum+row.expectedLearners,0);
  const capturedRequiredRecords=required.reduce((sum,row)=>sum+Math.min(row.capturedRecords,row.expectedLearners),0);
  const missingRequiredRecords=required.reduce((sum,row)=>sum+row.missingRequiredRecords,0);

  const groups=new Map<string,AssessmentQualityRow[]>();
  for(const row of rows.filter((item)=>item.captureMode==="detailed")){
    const key=[row.subjectOfferingId,row.registerClassId,row.teacherStaffMemberId ?? "none"].join(":");
    const list=groups.get(key) ?? [];
    list.push(row);
    groups.set(key,list);
  }
  const gaps:AssessmentQualityGap[]=[];
  for(const [key,group] of groups){
    const caAverage=weightedCategoryAverage(group,"ca");
    const examAverage=weightedCategoryAverage(group,"exam");
    if (caAverage===null || examAverage===null) continue;
    gaps.push({
      key,
      subjectName:group[0].subjectName,
      className:group[0].className,
      teacherName:group[0].teacherName,
      caAverage:Number(caAverage.toFixed(1)),
      examAverage:Number(examAverage.toFixed(1)),
      examMinusCa:Number((examAverage-caAverage).toFixed(1)),
    });
  }

  const scopeLabel=membership.roleKey==="hod"
    ? "Department portfolio"
    : ["teacher","class_teacher"].includes(membership.roleKey)
      ? "My teaching allocations"
      : "School-wide";

  return {
    schoolId:membership.schoolId,
    academicYear:params.academicYear,
    termNumber:params.termNumber ?? null,
    scopeLabel,
    rows,
    gaps:gaps.sort((a,b)=>a.subjectName.localeCompare(b.subjectName)||a.className.localeCompare(b.className)),
    summary:{
      instances:rows.length,
      detailedInstances:rows.filter((row)=>row.captureMode==="detailed").length,
      finalResultOnlyInstances:rows.filter((row)=>row.captureMode==="final_result").length,
      expectedRequiredRecords,
      capturedRequiredRecords,
      missingRequiredRecords,
      completionPercent:expectedRequiredRecords ? Number(((capturedRequiredRecords/expectedRequiredRecords)*100).toFixed(1)) : null,
      readiness,
    },
    options,
  };
}
