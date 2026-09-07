"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export type TeachingImpactActionState={success?:boolean;message?:string;fieldErrors?:Record<string,string[]>};
const impacts=["NORMAL","NO_TEACHING","PARTIAL_DAY","ALTERED_TIMETABLE","EXAM_TIMETABLE"] as const;
export async function saveTeachingImpact(_state:TeachingImpactActionState,formData:FormData):Promise<TeachingImpactActionState>{
  const parsed=z.object({schoolId:z.string().uuid(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),impact:z.enum(impacts),reason:z.string().trim().optional(),bellScheduleId:z.string().optional()}).safeParse({schoolId:formData.get("schoolId"),date:formData.get("date"),impact:formData.get("impact"),reason:String(formData.get("reason")??""),bellScheduleId:String(formData.get("bellScheduleId")??"")});
  if(!parsed.success)return{fieldErrors:parsed.error.flatten().fieldErrors};
  const canChoose=parsed.data.impact==="ALTERED_TIMETABLE"||parsed.data.impact==="EXAM_TIMETABLE";
  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.rpc("configure_school_teaching_day",{p_school_id:parsed.data.schoolId,p_school_date:parsed.data.date,p_teaching_impact:parsed.data.impact,p_reason:parsed.data.reason||null,p_bell_schedule_id:canChoose&&parsed.data.bellScheduleId?parsed.data.bellScheduleId:null,p_source:"school"});
  if(error)return{message:error.message||"Calendar teaching impact could not be saved."};
  revalidatePath("/calendar");revalidatePath("/timetable");
  return{success:true,message:"Teaching impact saved for the selected date."};
}
