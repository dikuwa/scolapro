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
  editable: boolean;
};

export type MarkEntryWindowData = {
  state: string;
  editable: boolean;
  policyMode: string;
  opensAt: string | null;
  closesAt: string | null;
  warningMinutes: number;
  manualLockedAt: string | null;
  correctionPending: boolean;
  activeReopenId: string | null;
  activeReopenScope: string | null;
  activeReopenExpiresAt: string | null;
  requiresReverification: boolean;
  reopenedEnrolmentIds: string[];
  serverNow: string | null;
};

export type MarkGridData = {
  instanceId: string;
  userId: string;
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
  canSubmit: boolean;
  canReview: boolean;
  canReopen: boolean;
  canManageWindow: boolean;
  canBroadReopen: boolean;
  latestSubmissionId: string | null;
  window: MarkEntryWindowData;
  rows: MarkGridRow[];
};

export async function getMarkGridData(instanceId: string): Promise<MarkGridData | null> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership = context.currentSchoolMembership;
  if (!membership) return null;

  const db = await createSupabaseServerClient();
  const { data: instance } = await db.from("assessment_instances")
    .select("id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,subject_offering_id,register_class_id,display_name,assessment_date,raw_max,status")
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
      .select("id,learner_id,admission_number,enrolled_from,enrolled_to,status")
      .eq("school_id",instance.school_id)
      .eq("academic_year",instance.academic_year)
      .eq("register_class_id",instance.register_class_id),
  ]);
  if (!offering || !registerClass) return null;

  const learnerIds=(enrolments ?? []).map((row)=>row.learner_id);
  const [{ data: subject }, { data: grade }, { data: learners }, { data: registrations }] = await Promise.all([
    db.from("subjects").select("display_name").eq("id",offering.subject_id).maybeSingle(),
    db.from("grades").select("display_name").eq("id",offering.grade_id).maybeSingle(),
    learnerIds.length ? db.from("learners").select("id,first_names,surname,preferred_name").in("id",learnerIds) : Promise.resolve({ data: [] }),
    (enrolments ?? []).length
      ? db.from("learner_subject_registrations")
          .select("enrolment_id,subject_offering_id,status,registered_at,withdrawn_at")
          .in("enrolment_id",(enrolments ?? []).map((row)=>row.id))
      : Promise.resolve({ data: [] }),
  ]);

  const enrolmentIds=(enrolments ?? []).map((row)=>row.id);
  const [{ data: marks }, { data: latestSubmission }, { data: windowPayload }] = await Promise.all([
    enrolmentIds.length
    ? db.from("learner_marks_current")
        .select("id,enrolment_id,numeric_mark,mark_status,teacher_note")
        .eq("assessment_instance_id",instance.id)
        .in("enrolment_id",enrolmentIds)
    : Promise.resolve({ data: [] }),
    db.from("mark_submissions")
      .select("id,status")
      .eq("assessment_instance_id",instance.id)
      .order("submitted_at",{ascending:false})
      .limit(1)
      .maybeSingle(),
    db.rpc("resolve_assessment_mark_entry_window",{
      p_assessment_instance_id:instance.id,
    }),
  ]);

  const rawWindow=(windowPayload ?? {}) as Partial<MarkEntryWindowData>;
  const window:MarkEntryWindowData={
    state:rawWindow.state ?? (["open","returned"].includes(instance.status) ? "open" : "locked"),
    editable:Boolean(rawWindow.editable),
    policyMode:rawWindow.policyMode ?? "legacy",
    opensAt:rawWindow.opensAt ?? null,
    closesAt:rawWindow.closesAt ?? null,
    warningMinutes:Number(rawWindow.warningMinutes ?? 0),
    manualLockedAt:rawWindow.manualLockedAt ?? null,
    correctionPending:Boolean(rawWindow.correctionPending),
    activeReopenId:rawWindow.activeReopenId ?? null,
    activeReopenScope:rawWindow.activeReopenScope ?? null,
    activeReopenExpiresAt:rawWindow.activeReopenExpiresAt ?? null,
    requiresReverification:Boolean(rawWindow.requiresReverification),
    reopenedEnrolmentIds:Array.isArray(rawWindow.reopenedEnrolmentIds)
      ? rawWindow.reopenedEnrolmentIds.filter((value):value is string=>typeof value==="string")
      : [],
    serverNow:rawWindow.serverNow ?? null,
  };
  const reopenedEnrolmentIds=new Set(window.reopenedEnrolmentIds);

  const learnerMap=new Map((learners ?? []).map((row)=>[row.id,row]));
  const markMap=new Map((marks ?? []).map((row)=>[row.enrolment_id,row]));
  const registrationsByEnrolment=new Map<string,Array<{subject_offering_id:string;status:string;registered_at:string;withdrawn_at:string|null}>>();
  for (const row of registrations ?? []) {
    const list=registrationsByEnrolment.get(row.enrolment_id) ?? [];
    list.push(row);
    registrationsByEnrolment.set(row.enrolment_id,list);
  }

  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Windhoek",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const eligibilityDate=instance.assessment_date ?? today;
  const rows=(enrolments ?? [])
    .filter((row)=>{
      const effective=row.enrolled_from<=eligibilityDate && (!row.enrolled_to || row.enrolled_to>=eligibilityDate);
      const lifecycleOk=instance.assessment_date ? effective : row.status==="current" && effective;
      if (!lifecycleOk) return false;
      const registrationsForLearner=registrationsByEnrolment.get(row.id) ?? [];
      return !registrationsForLearner.length
        || registrationsForLearner.some((item)=>{
          if (item.subject_offering_id!==instance.subject_offering_id) return false;
          if (!instance.assessment_date) return item.status==="active";
          const registeredOn=item.registered_at.slice(0,10);
          const withdrawnOn=item.withdrawn_at?.slice(0,10) ?? null;
          return registeredOn<=eligibilityDate && (!withdrawnOn || withdrawnOn>=eligibilityDate);
        });
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
        editable:window.editable || reopenedEnrolmentIds.has(row.id),
      };
    })
    .sort((a,b)=>a.learnerName.localeCompare(b.learnerName));

  return {
    instanceId: instance.id,
    userId: context.user.id,
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
    editable: rows.some((row)=>row.editable),
    canSubmit:["not_open","open","returned"].includes(instance.status),
    canReview: ["school_admin","principal","deputy_principal","hod"].includes(membership.roleKey),
    canReopen: ["school_admin","principal","deputy_principal","hod"].includes(membership.roleKey),
    canManageWindow:["school_admin","principal","deputy_principal"].includes(membership.roleKey),
    canBroadReopen:["school_admin","principal","deputy_principal"].includes(membership.roleKey),
    latestSubmissionId: latestSubmission?.id ?? null,
    window,
    rows,
  };
}


export type MarkGridQueueItem = {
  id: string;
  subject: string;
  className: string;
  assessmentName: string;
  status: string;
  rawMax: number | null;
  termNumber: number | null;
};

export async function getMarkGridQueue(): Promise<MarkGridQueueItem[] | null> {
  const context=await getUserContext();
  if (!context.user || context.platformMemberships.length || !context.currentSchoolMembership) return null;
  const membership=context.currentSchoolMembership;
  const db=await createSupabaseServerClient();

  const { data: instances }=await db.from("assessment_instances")
    .select("id,subject_offering_id,register_class_id,display_name,status,raw_max,term_number")
    .eq("school_id",membership.schoolId)
    .in("status",["open","returned","review","verified","locked"])
    .order("assessment_date",{ascending:false});
  const offeringIds=[...new Set((instances ?? []).map((row)=>row.subject_offering_id))];
  const classIds=[...new Set((instances ?? []).map((row)=>row.register_class_id))];
  const [{ data: offerings },{ data: classes }]=await Promise.all([
    offeringIds.length ? db.from("subject_offerings").select("id,subject_id").in("id",offeringIds) : Promise.resolve({data:[]}),
    classIds.length ? db.from("register_classes").select("id,display_name").in("id",classIds) : Promise.resolve({data:[]}),
  ]);
  const subjectIds=[...new Set((offerings ?? []).map((row)=>row.subject_id))];
  const { data: subjects }=subjectIds.length
    ? await db.from("subjects").select("id,display_name").in("id",subjectIds)
    : {data:[]};
  const subjectMap=new Map((subjects ?? []).map((row)=>[row.id,row.display_name]));
  const offeringMap=new Map((offerings ?? []).map((row)=>[row.id,subjectMap.get(row.subject_id) ?? "Subject"]));
  const classMap=new Map((classes ?? []).map((row)=>[row.id,row.display_name]));

  return (instances ?? []).map((row)=>({
    id:row.id,
    subject:offeringMap.get(row.subject_offering_id) ?? "Subject",
    className:classMap.get(row.register_class_id) ?? "Class",
    assessmentName:row.display_name,
    status:row.status,
    rawMax:row.raw_max == null ? null : Number(row.raw_max),
    termNumber:row.term_number ?? null,
  }));
}
