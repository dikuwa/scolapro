"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export type TeachingImpactActionState={success?:boolean;message?:string;fieldErrors?:Record<string,string[]>};
const impacts=["NORMAL","NO_TEACHING","PARTIAL_DAY","ALTERED_TIMETABLE","EXAM_TIMETABLE"] as const;
const audienceScopes=["all_learners","grade","register_class","teaching_group"] as const;

const calendarEventSchema=z.object({
  schoolId:z.string().uuid(),
  academicYear:z.coerce.number().int().min(2000).max(2200),
  title:z.string().trim().min(1,"Event title is required.").max(160),
  category:z.string().trim().min(1,"Category is required.").max(80),
  startsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt:z.union([z.literal(""),z.string().regex(/^\d{2}:\d{2}$/)]),
  endsAt:z.union([z.literal(""),z.string().regex(/^\d{2}:\d{2}$/)]),
  audience:z.string().min(1),
  description:z.string().trim().max(2000).optional(),
  impact:z.enum(impacts),
  bellScheduleId:z.union([z.literal(""),z.string().uuid()]),
}).superRefine((value,ctx)=>{
  if(value.endsOn<value.startsOn)ctx.addIssue({code:"custom",path:["endsOn"],message:"End date cannot be before start date."});
  if(Boolean(value.startsAt)!==Boolean(value.endsAt))ctx.addIssue({code:"custom",path:["endsAt"],message:"Provide both times or leave both blank."});
  if(value.startsAt&&value.endsAt&&value.endsAt<=value.startsAt)ctx.addIssue({code:"custom",path:["endsAt"],message:"End time must be after start time."});
});

export async function saveSchoolCalendarEvent(_state:TeachingImpactActionState,formData:FormData):Promise<TeachingImpactActionState>{
  const parsed=calendarEventSchema.safeParse({
    schoolId:formData.get("schoolId"),academicYear:formData.get("academicYear"),title:formData.get("title"),category:formData.get("category"),
    startsOn:formData.get("startsOn"),endsOn:formData.get("endsOn"),startsAt:String(formData.get("startsAt")??""),endsAt:String(formData.get("endsAt")??""),
    audience:formData.get("audience"),description:String(formData.get("description")??""),impact:formData.get("impact"),bellScheduleId:String(formData.get("bellScheduleId")??""),
  });
  if(!parsed.success)return{fieldErrors:parsed.error.flatten().fieldErrors,message:"Check the highlighted calendar event fields."};
  const [audienceScopeRaw,audienceReferenceIdRaw]=parsed.data.audience.split(":",2);
  const audienceScope=audienceScopes.find((item)=>item===audienceScopeRaw);
  if(!audienceScope)return{message:"Choose a valid learner audience."};
  const audienceReferenceId=audienceScope==="all_learners"?null:audienceReferenceIdRaw;
  if(audienceScope!=="all_learners"&&!z.string().uuid().safeParse(audienceReferenceId).success)return{message:"Choose a valid learner audience."};
  const canChooseSchedule=parsed.data.impact==="ALTERED_TIMETABLE"||parsed.data.impact==="EXAM_TIMETABLE";
  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.rpc("create_school_learner_calendar_event",{
    p_school_id:parsed.data.schoolId,p_academic_year:parsed.data.academicYear,p_title:parsed.data.title,p_category:parsed.data.category,
    p_starts_on:parsed.data.startsOn,p_ends_on:parsed.data.endsOn,p_starts_at:parsed.data.startsAt||null,p_ends_at:parsed.data.endsAt||null,
    p_audience_scope:audienceScope,p_audience_reference_id:audienceReferenceId,p_description:parsed.data.description||null,
    p_teaching_impact:parsed.data.impact,p_bell_schedule_id:canChooseSchedule&&parsed.data.bellScheduleId?parsed.data.bellScheduleId:null,
  });
  if(error)return{message:error.message||"Learner calendar event could not be saved."};
  revalidatePath("/calendar");revalidatePath("/timetable");revalidatePath("/attendance");
  return{success:true,message:"Learner calendar event added."};
}

const nationalCalendarEventSchema=z.object({
  academicYear:z.coerce.number().int().min(2000).max(2200),title:z.string().trim().min(1).max(160),category:z.string().trim().min(1).max(80),
  startsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt:z.union([z.literal(""),z.string().regex(/^\d{2}:\d{2}$/)]),endsAt:z.union([z.literal(""),z.string().regex(/^\d{2}:\d{2}$/)]),
  description:z.string().trim().max(2000).optional(),impact:z.enum(impacts),
}).superRefine((value,ctx)=>{
  if(value.endsOn<value.startsOn)ctx.addIssue({code:"custom",path:["endsOn"],message:"End date cannot be before start date."});
  if(Boolean(value.startsAt)!==Boolean(value.endsAt))ctx.addIssue({code:"custom",path:["endsAt"],message:"Provide both times or leave both blank."});
  if(value.startsAt&&value.endsAt&&value.endsAt<=value.startsAt)ctx.addIssue({code:"custom",path:["endsAt"],message:"End time must be after start time."});
});

export async function saveNationalCalendarEvent(_state:TeachingImpactActionState,formData:FormData):Promise<TeachingImpactActionState>{
  const parsed=nationalCalendarEventSchema.safeParse({academicYear:formData.get("academicYear"),title:formData.get("title"),category:formData.get("category"),startsOn:formData.get("startsOn"),endsOn:formData.get("endsOn"),startsAt:String(formData.get("startsAt")??""),endsAt:String(formData.get("endsAt")??""),description:String(formData.get("description")??""),impact:formData.get("impact")});
  if(!parsed.success)return{fieldErrors:parsed.error.flatten().fieldErrors,message:"Check the highlighted national calendar fields."};
  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.rpc("create_national_learner_calendar_event",{p_academic_year:parsed.data.academicYear,p_title:parsed.data.title,p_category:parsed.data.category,p_starts_on:parsed.data.startsOn,p_ends_on:parsed.data.endsOn,p_starts_at:parsed.data.startsAt||null,p_ends_at:parsed.data.endsAt||null,p_description:parsed.data.description||null,p_teaching_impact:parsed.data.impact});
  if(error)return{message:error.message||"National learner calendar event could not be saved."};
  revalidatePath("/platform/calendar");revalidatePath("/calendar");revalidatePath("/timetable");revalidatePath("/attendance");
  return{success:true,message:"National learner calendar event added."};
}

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
