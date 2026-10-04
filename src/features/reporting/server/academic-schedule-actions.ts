"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAcademicSchedulePayload, ACADEMIC_SCHEDULE_TYPES } from "@/features/reporting/server/academic-schedules";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";

export type AcademicScheduleActionState = { success?: boolean; message?: string; snapshotId?: string };

const schema=z.object({
  academicYear:z.coerce.number().int().min(2000).max(2200),
  termNumber:z.coerce.number().int().min(1).max(6),
  scheduleType:z.enum(ACADEMIC_SCHEDULE_TYPES),
  basis:z.literal("official"),
  supersessionReason:z.string().trim().max(1000).optional(),
  gradeId:z.string().uuid(),
  classIds:z.string().max(8000).optional(),
});

export async function finalizeAcademicSchedule(
  _state:AcademicScheduleActionState,
  formData:FormData,
):Promise<AcademicScheduleActionState>{
  const parsed=schema.safeParse({
    academicYear:formData.get("academicYear"),
    termNumber:formData.get("termNumber"),
    scheduleType:formData.get("scheduleType"),
    basis:formData.get("basis"),
    supersessionReason:String(formData.get("supersessionReason")??""),
    gradeId:String(formData.get("gradeId")??""),
    classIds:String(formData.get("classIds")??"[]"),
  });
  if(!parsed.success) return {message:"Choose a valid official schedule, year, period and grade."};

  let classIds:string[];
  try{
    const value=JSON.parse(parsed.data.classIds||"[]");
    if(!Array.isArray(value)||value.some((item)=>typeof item!=="string"||!z.string().uuid().safeParse(item).success)){
      return {message:"Choose a valid class scope."};
    }
    classIds=[...new Set(value)].sort();
  }catch{
    return {message:"Choose a valid class scope."};
  }

  const context=await getUserContext();
  const membership=context.currentSchoolMembership;
  if(!context.user||!membership||!["school_admin","principal","deputy_principal"].includes(membership.roleKey)){
    return {message:"Official academic schedule finalization is restricted to school management."};
  }

  try{
    const payload=await getAcademicSchedulePayload({
      academicYear:parsed.data.academicYear,
      termNumber:parsed.data.termNumber,
      scheduleType:parsed.data.scheduleType,
      basis:"official",
      gradeId:parsed.data.gradeId,
      classIds,
    });
    if(!payload) return {message:"Unable to build this schedule from canonical academic data."};
    const unavailableRequiredSources=(payload.sourceReadiness??[])
      .filter((item)=>["Academic terms","Learner roster","Subjects"].includes(item.label)&&item.status==="unavailable")
      .map((item)=>item.label);
    if(unavailableRequiredSources.length){
      return {message:"Cannot finalize until governed "+unavailableRequiredSources.join(", ").toLowerCase()+" are available."};
    }

    const [db,documentHeader]=await Promise.all([
      Promise.resolve(createSupabaseAdminClient()),
      getLiveSchoolDocumentHeader(membership.schoolId,"internal_school"),
    ]);

    const {data,error}=await db.rpc("finalize_academic_schedule_snapshot",{
      p_school_id:membership.schoolId,
      p_academic_year:parsed.data.academicYear,
      p_term_number:parsed.data.termNumber,
      p_schedule_type:parsed.data.scheduleType,
      p_basis:"official",
      p_title:payload.title,
      p_payload:payload,
      p_scope_key:payload.scopeKey,
      p_metadata:{
        sourceDescription:payload.sourceDescription,
        rowCount:payload.rowCount,
        generatedAt:payload.generatedAt,
        templateFidelity:"supplied_source_verified",
        sourceArtifacts:[
          {name:"Schedule - Namibia.pdf",sha256:"f93d41b15ea9fb26970372b000ae49fe20d09afc0737947077b4d62bc9b4df22"},
          {name:"Schedule - Namibia All Terms.pdf",sha256:"2593a895583bb392fb121f9f30f2d7b908b2c9bb443cef62d99d2c557416ed1b"},
          {name:"Generic Mark Schedule.pdf",sha256:"1e7f47d0eb4298f928eb844346c129ae2603dd7f7618684dd3840eeafdf6368c"},
        ],
        scope:{
          key:payload.scopeKey,
          period:payload.period,
          gradeId:payload.gradeId,
          grade:payload.grade,
          classIds:payload.classIds,
          classNames:payload.classNames,
        },
        sourceReadiness:payload.sourceReadiness??[],
        documentHeader,
      },
      p_supersession_reason:parsed.data.supersessionReason||null,
      p_actor_user_id:context.user.id,
    });
    if(error) return {message:error.message||"Unable to finalize the academic schedule."};
    revalidatePath("/reports/academic-schedules");
    return {success:true,snapshotId:String(data),message:"Official schedule finalized and version history preserved."};
  }catch{
    return {message:"Unable to finalize the academic schedule from canonical academic data."};
  }
}
