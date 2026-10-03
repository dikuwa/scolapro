"use server";

import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MarkGridActionState = {
  success?: boolean;
  message: string;
  missing?: number;
  captured?: number;
};

async function scopedInstance(instanceId:string) {
  const context=await getUserContext();
  if (!context.user || context.platformMemberships.length || !context.currentSchoolMembership) return null;
  const db=await createSupabaseServerClient();
  const { data: instance }=await db.from("assessment_instances")
    .select("id,school_id,status,correction_pending,register_class_id,academic_year,subject_offering_id,assessment_date")
    .eq("id",instanceId).maybeSingle();
  if (!instance || instance.school_id!==context.currentSchoolMembership.schoolId) return null;
  return {context,db,instance};
}

export async function validateMarkGrid(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState> {
  const instanceId=String(form.get("instanceId") ?? "");
  const scope=await scopedInstance(instanceId);
  if (!scope) return {message:"Assessment is outside your current authority."};
  const { data: enrolments }=await scope.db.from("enrolments")
    .select("id,enrolled_from,enrolled_to,status")
    .eq("school_id",scope.instance.school_id)
    .eq("academic_year",scope.instance.academic_year)
    .eq("register_class_id",scope.instance.register_class_id);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Windhoek",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const eligibilityDate=scope.instance.assessment_date ?? today;
  const eligibleByDate=(enrolments ?? []).filter((row)=>{
    const effective=row.enrolled_from<=eligibilityDate && (!row.enrolled_to || row.enrolled_to>=eligibilityDate);
    return scope.instance.assessment_date ? effective : row.status==="current" && effective;
  });
  const ids=eligibleByDate.map((row)=>row.id);
  const [{ data: registrations },{ data: marks }]=await Promise.all([
    ids.length ? scope.db.from("learner_subject_registrations").select("enrolment_id,subject_offering_id,status").in("enrolment_id",ids) : Promise.resolve({data:[]}),
    ids.length ? scope.db.from("learner_marks_current").select("enrolment_id,numeric_mark,mark_status").eq("assessment_instance_id",instanceId).in("enrolment_id",ids) : Promise.resolve({data:[]}),
  ]);

  const registrationMap=new Map<string,Array<{subject_offering_id:string;status:string}>>();
  for (const row of registrations ?? []) {
    const list=registrationMap.get(row.enrolment_id) ?? [];
    list.push(row);
    registrationMap.set(row.enrolment_id,list);
  }
  const eligible=ids.filter((id)=>{
    const list=registrationMap.get(id) ?? [];
    return !list.length || list.some((item)=>item.subject_offering_id===scope.instance.subject_offering_id && item.status==="active");
  });
  const capturedSet=new Set((marks ?? []).filter((row)=>row.numeric_mark!=null || row.mark_status!=null).map((row)=>row.enrolment_id));
  const captured=eligible.filter((id)=>capturedSet.has(id)).length;
  const missing=eligible.length-captured;
  return missing
    ? {message:`${missing} eligible learner${missing===1?" is":"s are"} still missing a mark or explicit status.`,missing,captured}
    : {success:true,message:`Validation passed: ${captured} eligible learner${captured===1?"":"s"} complete.`,missing:0,captured};
}

export async function submitMarkGrid(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState> {
  const instanceId=String(form.get("instanceId") ?? "");
  const scope=await scopedInstance(instanceId);
  if (!scope) return {message:"Assessment is outside your current authority."};
  const { error }=await scope.db.rpc("submit_assessment_for_review",{
    p_assessment_instance_id:instanceId,
    p_calculation_version:"weighted-v1",
  });
  if (error) return {message:error.message.includes("incomplete") ? "Marks are incomplete. Validate the grid and resolve missing learners first." : "Assessment could not be submitted for review."};
  revalidatePath(`/assessment/marks/${instanceId}`);
  revalidatePath("/assessment/marks");
  revalidatePath("/assessment");
  return {success:true,message:"Assessment submitted for HOD/leadership review. Ordinary editing is now locked until returned."};
}


export async function reviewMarkGrid(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState> {
  const submissionId=String(form.get("submissionId") ?? "");
  const instanceId=String(form.get("instanceId") ?? "");
  const decision=String(form.get("decision") ?? "");
  const note=String(form.get("note") ?? "").trim();
  if (!submissionId || !instanceId || !["verify","return"].includes(decision)) return {message:"Review action is invalid."};
  if (decision==="return" && !note) return {message:"A return reason is required."};

  const scope=await scopedInstance(instanceId);
  if (!scope) return {message:"Assessment is outside your current authority."};
  const { error }=await scope.db.rpc("review_mark_submission",{
    p_submission_id:submissionId,
    p_decision:decision,
    p_note:note || null,
  });
  if (error) return {message:"Review could not be completed within your current subject portfolio."};
  revalidatePath(`/assessment/marks/${instanceId}`);
  revalidatePath("/assessment/marks");
  revalidatePath("/assessment");
  return {success:true,message:decision==="verify" ? "Marks verified. Final locking remains part of official result approval." : "Assessment returned to the teacher with the recorded reason."};
}

function windhoekTimestamp(date:string,time:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return `${date}T${time}:00+02:00`;
}

function revalidateAssessment(instanceId:string) {
  revalidatePath(`/assessment/marks/${instanceId}`);
  revalidatePath("/assessment/marks");
  revalidatePath("/assessment");
}

export async function configureMarkEntryWindow(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState> {
  const instanceId=String(form.get("instanceId") ?? "");
  const policyMode=String(form.get("policyMode") ?? "");
  const openDate=String(form.get("openDate") ?? "");
  const openTime=String(form.get("openTime") ?? "");
  const closeDate=String(form.get("closeDate") ?? "");
  const closeTime=String(form.get("closeTime") ?? "");
  const warningMinutes=Number(form.get("warningMinutes") ?? 0);
  const opensAt=openDate || openTime ? windhoekTimestamp(openDate,openTime) : null;
  const closesAt=closeDate || closeTime ? windhoekTimestamp(closeDate,closeTime) : null;
  if ((openDate || openTime) && !opensAt) return {message:"Choose a valid opening date and time."};
  if ((closeDate || closeTime) && !closesAt) return {message:"Choose a valid closing date and time."};
  if (!Number.isInteger(warningMinutes) || warningMinutes<0 || warningMinutes>10080) return {message:"Warning minutes must be between 0 and 10080."};

  const scope=await scopedInstance(instanceId);
  if (!scope) return {message:"Assessment is outside your current authority."};
  const { error }=await scope.db.rpc("configure_assessment_mark_entry_window",{
    p_assessment_instance_id:instanceId,
    p_opens_at:opensAt,
    p_closes_at:closesAt,
    p_warning_minutes:warningMinutes,
    p_policy_mode:policyMode,
  });
  if (error) return {message:"Mark-entry policy could not be saved within your current authority."};
  revalidateAssessment(instanceId);
  return {success:true,message:"Mark-entry window policy saved. Effective locking is enforced on the server."};
}

export async function lockMarkEntryWindow(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState> {
  const instanceId=String(form.get("instanceId") ?? "");
  const reason=String(form.get("reason") ?? "").trim();
  if (!reason) return {message:"A manual lock reason is required."};
  const scope=await scopedInstance(instanceId);
  if (!scope) return {message:"Assessment is outside your current authority."};
  const { error }=await scope.db.rpc("lock_assessment_mark_entry",{
    p_assessment_instance_id:instanceId,
    p_reason:reason,
  });
  if (error) return {message:"Mark entry could not be locked within your current authority."};
  revalidateAssessment(instanceId);
  return {success:true,message:"Mark entry locked. Corrections now require a bounded authorization."};
}

export async function authorizeMarkCorrection(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState> {
  const instanceId=String(form.get("instanceId") ?? "");
  const scopeKind=String(form.get("scopeKind") ?? "");
  const enrolmentId=String(form.get("enrolmentId") ?? "") || null;
  const reason=String(form.get("reason") ?? "").trim();
  const startDate=String(form.get("startDate") ?? "");
  const startTime=String(form.get("startTime") ?? "");
  const expiryDate=String(form.get("expiryDate") ?? "");
  const expiryTime=String(form.get("expiryTime") ?? "");
  const startsAt=windhoekTimestamp(startDate,startTime);
  const expiresAt=windhoekTimestamp(expiryDate,expiryTime);
  if (!reason) return {message:"A correction reason is required."};
  if (!startsAt || !expiresAt) return {message:"Correction start and expiry date/time are required."};

  const scope=await scopedInstance(instanceId);
  if (!scope) return {message:"Assessment is outside your current authority."};
  const { error }=await scope.db.rpc("authorize_assessment_mark_correction",{
    p_assessment_instance_id:instanceId,
    p_scope_kind:scopeKind,
    p_enrolment_id:scopeKind==="learner" ? enrolmentId : null,
    p_reason:reason,
    p_starts_at:startsAt,
    p_expires_at:expiresAt,
    p_requires_reverification:true,
  });
  if (error) {
    if (error.message.includes("school leadership authority")) {
      return {message:"Subject-class correction requires School Admin, Principal or Deputy Principal authority."};
    }
    return {message:"Correction authorization could not be created within your current authority."};
  }
  revalidateAssessment(instanceId);
  return {success:true,message:"Bounded correction authorization created. Corrected marks will be linked to it and must be re-verified."};
}
