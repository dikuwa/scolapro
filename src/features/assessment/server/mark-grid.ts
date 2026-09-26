import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MarkGridRow = {
  enrolmentId: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  numericMark: number | null;
  markStatus: "absent" | "exempt" | "incomplete" | "withheld" | null;
  teacherNote: string | null;
  version: string | null;
};

export type MarkGridData = {
  instanceId: string;
  schoolId: string;
  tenantId: string;
  academicYear: number;
  subject: string;
  grade: string;
  className: string;
  assessmentName: string;
  componentName: string | null;
  rawMax: number | null;
  status: string;
  editable: boolean;
  rows: MarkGridRow[];
};

export async function getMarkGridData(instanceId: string): Promise<MarkGridData | null> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership = context.currentSchoolMembership;
  if (!membership) return null;

  const db = await createSupabaseServerClient();
  const { data: instance } = await db.from("assessment_instances")
    .select("id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,subject_offering_id,register_class_id,display_name,raw_max,status")
    .eq("id", instanceId)
    .maybeSingle();
  if (!instance || instance.school_id !== membership.schoolId) return null;

  const [{ data: offering }, { data: registerClass }, { data: component }, { data: enrolments }] = await Promise.all([
    db.from("subject_offerings").select("id,subject_id,grade_id").eq("id",instance.subject_offering_id).maybeSingle(),
    db.from("register_classes").select("id,display_name,grade_id").eq("id",instance.register_class_id).maybeSingle(),
    instance.assessment_component_id
      ? db.from("assessment_components").select("id,display_name,raw_max").eq("id",instance.assessment_component_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("enrolments")
      .select("id,learner_id,admission_number")
      .eq("school_id",instance.school_id)
      .eq("academic_year",instance.academic_year)
      .eq("register_class_id",instance.register_class_id)
      .eq("status","current"),
  ]);
  if (!offering || !registerClass) return null;

  const learnerIds=(enrolments ?? []).map((row)=>row.learner_id);
  const [{ data: subject }, { data: grade }, { data: learners }, { data: registrations }] = await Promise.all([
    db.from("subjects").select("display_name").eq("id",offering.subject_id).maybeSingle(),
    db.from("grades").select("display_name").eq("id",offering.grade_id).maybeSingle(),
    learnerIds.length ? db.from("learners").select("id,first_names,surname,preferred_name").in("id",learnerIds) : Promise.resolve({ data: [] }),
    (enrolments ?? []).length
      ? db.from("learner_subject_registrations")
          .select("enrolment_id,subject_offering_id,status")
          .in("enrolment_id",(enrolments ?? []).map((row)=>row.id))
      : Promise.resolve({ data: [] }),
  ]);

  const enrolmentIds=(enrolments ?? []).map((row)=>row.id);
  const { data: marks } = enrolmentIds.length
    ? await db.from("learner_marks_current")
        .select("id,enrolment_id,numeric_mark,mark_status,teacher_note")
        .eq("assessment_instance_id",instance.id)
        .in("enrolment_id",enrolmentIds)
    : { data: [] };

  const learnerMap=new Map((learners ?? []).map((row)=>[row.id,row]));
  const markMap=new Map((marks ?? []).map((row)=>[row.enrolment_id,row]));
  const registrationsByEnrolment=new Map<string,Array<{subject_offering_id:string;status:string}>>();
  for (const row of registrations ?? []) {
    const list=registrationsByEnrolment.get(row.enrolment_id) ?? [];
    list.push(row);
    registrationsByEnrolment.set(row.enrolment_id,list);
  }

  const rows=(enrolments ?? [])
    .filter((row)=>{
      const registrationsForLearner=registrationsByEnrolment.get(row.id) ?? [];
      return !registrationsForLearner.length
        || registrationsForLearner.some((item)=>item.subject_offering_id===instance.subject_offering_id && item.status==="active");
    })
    .map((row)=>{
      const learner=learnerMap.get(row.learner_id);
      const mark=markMap.get(row.id);
      const learnerName=learner
        ? `${learner.surname}, ${learner.preferred_name || learner.first_names}`
        : "Learner";
      return {
        enrolmentId: row.id,
        learnerId: row.learner_id,
        learnerName,
        admissionNumber: row.admission_number ?? null,
        numericMark: mark?.numeric_mark == null ? null : Number(mark.numeric_mark),
        markStatus: (mark?.mark_status ?? null) as MarkGridRow["markStatus"],
        teacherNote: mark?.teacher_note ?? null,
        version: mark?.id ?? null,
      };
    })
    .sort((a,b)=>a.learnerName.localeCompare(b.learnerName));

  return {
    instanceId: instance.id,
    schoolId: instance.school_id,
    tenantId: instance.tenant_id,
    academicYear: instance.academic_year,
    subject: subject?.display_name ?? "Subject",
    grade: grade?.display_name ?? "Grade",
    className: registerClass.display_name,
    assessmentName: instance.display_name,
    componentName: component?.display_name ?? null,
    rawMax: instance.raw_max == null ? (component?.raw_max == null ? null : Number(component.raw_max)) : Number(instance.raw_max),
    status: instance.status,
    editable: ["open","returned"].includes(instance.status),
    rows,
  };
}
