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
    .select("id,school_id,status,register_class_id,academic_year,subject_offering_id")
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
  if (!["open","returned"].includes(scope.instance.status)) return {message:"This assessment is no longer editable."};

  const { data: enrolments }=await scope.db.from("enrolments")
    .select("id")
    .eq("school_id",scope.instance.school_id)
    .eq("academic_year",scope.instance.academic_year)
    .eq("register_class_id",scope.instance.register_class_id)
    .eq("status","current");
  const ids=(enrolments ?? []).map((row)=>row.id);
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

export async function reopenMarkGridForCorrection(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState> {
  const instanceId=String(form.get("instanceId") ?? "");
  const reason=String(form.get("reason") ?? "").trim();
  if (!reason) return {message:"A correction reason is required."};
  const scope=await scopedInstance(instanceId);
  if (!scope) return {message:"Assessment is outside your current authority."};
  const { error }=await scope.db.rpc("reopen_assessment_for_correction",{
    p_assessment_instance_id:instanceId,
    p_reason:reason,
  });
  if (error) return {message:error.message.includes("Official results already exist") ? "This assessment already has immutable official results. Use the governed official-result correction workflow." : "Assessment could not be reopened within your current authority."};
  revalidatePath(`/assessment/marks/${instanceId}`);
  revalidatePath("/assessment/marks");
  revalidatePath("/assessment");
  return {success:true,message:"Assessment reopened as Returned. The reason is retained in the audit trail."};
}
