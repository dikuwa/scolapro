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
  revalidatePath("/calendar");revalidatePath("/attendance");revalidatePath("/timetable");revalidatePath("/academics");
  return{success:true,message:"Calendar adjustment saved for the selected learner date."};
}

export async function deleteTeachingImpactAdjustment(
  _state:TeachingImpactActionState,
  formData:FormData,
):Promise<TeachingImpactActionState>{
  const parsed=z.object({
    schoolId:z.string().uuid(),
    date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse({
    schoolId:formData.get("schoolId"),
    date:formData.get("date"),
  });
  if(!parsed.success)return{message:"Choose a valid calendar adjustment."};

  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("remove_school_teaching_day_adjustment",{
    p_school_id:parsed.data.schoolId,
    p_school_date:parsed.data.date,
  });
  if(error)return{message:error.message||"Calendar adjustment could not be deleted."};

  revalidatePath("/calendar");revalidatePath("/attendance");revalidatePath("/timetable");revalidatePath("/academics");
  return{
    success:true,
    message:data==="restored_baseline"
      ?"School correction deleted. The official calendar baseline is active again."
      :"Calendar adjustment deleted.",
  };
}

const operationalEventKinds = [
  "event","deadline","meeting","class_visit","assessment","submission",
  "examination","school_activity","teaching_cutoff","ceremony","sport","other",
] as const;
const operationalScopes = ["school","department"] as const;
const operationalAudiences = [
  "all_school","all_staff","teachers","learners","parents","department_staff","specific_teacher",
] as const;
const learnerDayEffects = [
  "UNCHANGED","NO_TEACHING","SCHOOL_DAY","PARTIAL_DAY","ALTERED_TIMETABLE","EXAM_TIMETABLE",
] as const;

const operationalCalendarEventSchema = z.object({
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int().min(2000).max(2200),
  scopeKind: z.enum(operationalScopes),
  eventKind: z.enum(operationalEventKinds),
  title: z.string().trim().min(1,"Event title is required.").max(180),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.union([z.literal(""),z.string().regex(/^\d{2}:\d{2}$/)]),
  endsAt: z.union([z.literal(""),z.string().regex(/^\d{2}:\d{2}$/)]),
  audienceScope: z.enum(operationalAudiences),
  departmentAssignmentId: z.union([z.literal(""),z.string().uuid()]),
  targetStaffMemberId: z.union([z.literal(""),z.string().uuid()]),
  description: z.string().trim().max(3000).optional(),
  learnerDayEffect: z.enum(learnerDayEffects),
  bellScheduleId: z.union([z.literal(""),z.string().uuid()]),
  linkedModule: z.string().trim().max(80).optional(),
  linkedPath: z.string().trim().max(500).optional(),
}).superRefine((value,ctx)=>{
  if(value.endsOn<value.startsOn)ctx.addIssue({code:"custom",path:["endsOn"],message:"End date cannot be before start date."});
  if(Boolean(value.startsAt)!==Boolean(value.endsAt))ctx.addIssue({code:"custom",path:["endsAt"],message:"Provide both times or leave both blank."});
  if(value.startsAt&&value.endsAt&&value.endsAt<=value.startsAt)ctx.addIssue({code:"custom",path:["endsAt"],message:"End time must be after start time."});
  if(value.scopeKind==="department"&&!value.departmentAssignmentId)ctx.addIssue({code:"custom",path:["departmentAssignmentId"],message:"Choose a governed department."});
  if(value.scopeKind==="department"&&value.learnerDayEffect!=="UNCHANGED")ctx.addIssue({code:"custom",path:["learnerDayEffect"],message:"Department events cannot change learner school-day status."});
  if(value.audienceScope==="specific_teacher"&&!value.targetStaffMemberId)ctx.addIssue({code:"custom",path:["targetStaffMemberId"],message:"Choose the target teacher."});
});

export async function saveOperationalCalendarEvent(
  _state:TeachingImpactActionState,
  formData:FormData,
):Promise<TeachingImpactActionState>{
  const parsed=operationalCalendarEventSchema.safeParse({
    schoolId:formData.get("schoolId"),
    academicYear:formData.get("academicYear"),
    scopeKind:formData.get("scopeKind"),
    eventKind:formData.get("eventKind"),
    title:formData.get("title"),
    startsOn:formData.get("startsOn"),
    endsOn:formData.get("endsOn"),
    startsAt:String(formData.get("startsAt")??""),
    endsAt:String(formData.get("endsAt")??""),
    audienceScope:formData.get("audienceScope"),
    departmentAssignmentId:String(formData.get("departmentAssignmentId")??""),
    targetStaffMemberId:String(formData.get("targetStaffMemberId")??""),
    description:String(formData.get("description")??""),
    learnerDayEffect:formData.get("learnerDayEffect"),
    bellScheduleId:String(formData.get("bellScheduleId")??""),
    linkedModule:String(formData.get("linkedModule")??""),
    linkedPath:String(formData.get("linkedPath")??""),
  });
  if(!parsed.success)return{fieldErrors:parsed.error.flatten().fieldErrors,message:"Check the highlighted operational-calendar fields."};

  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.rpc("create_operational_calendar_event",{
    p_school_id:parsed.data.schoolId,
    p_academic_year:parsed.data.academicYear,
    p_scope_kind:parsed.data.scopeKind,
    p_event_kind:parsed.data.eventKind,
    p_title:parsed.data.title,
    p_starts_on:parsed.data.startsOn,
    p_ends_on:parsed.data.endsOn,
    p_starts_at:parsed.data.startsAt||null,
    p_ends_at:parsed.data.endsAt||null,
    p_audience_scope:parsed.data.audienceScope,
    p_department_head_staff_assignment_id:parsed.data.departmentAssignmentId||null,
    p_target_staff_member_id:parsed.data.targetStaffMemberId||null,
    p_description:parsed.data.description||null,
    p_learner_day_effect:parsed.data.learnerDayEffect,
    p_bell_schedule_id:parsed.data.bellScheduleId||null,
    p_linked_module:parsed.data.linkedModule||null,
    p_linked_path:parsed.data.linkedPath||null,
    p_source_kind:"manual",
    p_source_reference:null,
    p_source_intake_job_id:null,
    p_supersedes_event_id:null,
    p_lifecycle_status:"active",
  });
  if(error)return{message:error.message||"Operational calendar event could not be saved."};
  revalidatePath("/calendar");revalidatePath("/");revalidatePath("/attendance");revalidatePath("/timetable");
  return{success:true,message:parsed.data.scopeKind==="department"?"Department calendar event added.":"School calendar event added."};
}

const termCalendarProfileSchema=z.object({
  academicTermId:z.string().uuid(),
  learnerStartsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"Learner opening date is required."),
  learnerEndsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"Learner closing date is required."),
  teacherStartsOn:z.union([z.literal(""),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  teacherEndsOn:z.union([z.literal(""),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  officialLearnerDayCount:z.union([z.literal(""),z.coerce.number().int().min(0).max(366)]),
  sourceLabel:z.string().trim().max(240).optional(),
  sourceReference:z.string().trim().max(500).optional(),
}).superRefine((value,ctx)=>{
  if(value.learnerEndsOn<value.learnerStartsOn)ctx.addIssue({code:"custom",path:["learnerEndsOn"],message:"Learner closing date cannot precede opening date."});
  if(Boolean(value.teacherStartsOn)!==Boolean(value.teacherEndsOn))ctx.addIssue({code:"custom",path:["teacherEndsOn"],message:"Provide both teacher opening and closing dates or leave both blank."});
  if(value.teacherStartsOn&&value.teacherEndsOn&&value.teacherEndsOn<value.teacherStartsOn)ctx.addIssue({code:"custom",path:["teacherEndsOn"],message:"Teacher closing date cannot precede opening date."});
});

export async function saveTermCalendarProfile(
  _state:TeachingImpactActionState,
  formData:FormData,
):Promise<TeachingImpactActionState>{
  const parsed=termCalendarProfileSchema.safeParse({
    academicTermId:formData.get("academicTermId"),
    learnerStartsOn:String(formData.get("learnerStartsOn")??""),
    learnerEndsOn:String(formData.get("learnerEndsOn")??""),
    teacherStartsOn:String(formData.get("teacherStartsOn")??""),
    teacherEndsOn:String(formData.get("teacherEndsOn")??""),
    officialLearnerDayCount:String(formData.get("officialLearnerDayCount")??""),
    sourceLabel:String(formData.get("sourceLabel")??""),
    sourceReference:String(formData.get("sourceReference")??""),
  });
  if(!parsed.success)return{fieldErrors:parsed.error.flatten().fieldErrors,message:"Check the official term-calendar metadata."};
  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.rpc("configure_operational_term_calendar",{
    p_academic_term_id:parsed.data.academicTermId,
    p_learner_starts_on:parsed.data.learnerStartsOn,
    p_learner_ends_on:parsed.data.learnerEndsOn,
    p_teacher_starts_on:parsed.data.teacherStartsOn||null,
    p_teacher_ends_on:parsed.data.teacherEndsOn||null,
    p_official_learner_day_count:parsed.data.officialLearnerDayCount===""?null:parsed.data.officialLearnerDayCount,
    p_source_kind:"manual",
    p_source_label:parsed.data.sourceLabel||null,
    p_source_reference:parsed.data.sourceReference||null,
  });
  if(error)return{message:error.message||"Official term-calendar metadata could not be saved."};
  revalidatePath("/calendar");revalidatePath("/attendance");revalidatePath("/timetable");revalidatePath("/academics");
  return{success:true,message:"Official term calendar saved. Learner boundaries now drive operational dates."};
}
