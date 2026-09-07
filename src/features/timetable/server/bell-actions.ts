"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BellActionState = { success?: boolean; message?: string; fieldErrors?: Record<string,string[]> };

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");

export async function saveBellSchedule(_state: BellActionState, formData: FormData): Promise<BellActionState> {
  const parsed = z.object({ schoolId:z.string().uuid(), academicYear:z.coerce.number().int(), name:z.string().trim().min(1,"Schedule name is required."), effectiveFrom:dateValue, effectiveTo:z.string().optional() }).safeParse({
    schoolId:formData.get("schoolId"), academicYear:formData.get("academicYear"), name:formData.get("name"), effectiveFrom:formData.get("effectiveFrom"), effectiveTo:String(formData.get("effectiveTo")??"")
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const weekdays = formData.getAll("weekday").map(Number).filter((value) => Number.isInteger(value) && value>=1 && value<=7);
  if (!weekdays.length) return { message:"Choose at least one weekday for this bell schedule." };
  if (parsed.data.effectiveTo && parsed.data.effectiveTo < parsed.data.effectiveFrom) return { message:"Bell schedule end date cannot be before its start date." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_timetable_bell_schedule", {
    p_school_id:parsed.data.schoolId, p_academic_year:parsed.data.academicYear, p_display_name:parsed.data.name,
    p_effective_from:parsed.data.effectiveFrom, p_effective_to:parsed.data.effectiveTo || null, p_applies_to_weekdays:weekdays,
  });
  if (error) return { message:error.message || "Bell schedule could not be saved." };
  revalidatePath("/timetable"); revalidatePath("/calendar");
  return { success:true, message:"Bell schedule saved." };
}

export async function saveBellPeriod(_state: BellActionState, formData: FormData): Promise<BellActionState> {
  const parsed = z.object({ scheduleId:z.string().uuid(), periodId:z.string().uuid(), startsAt:z.string().optional(), endsAt:z.string().optional() }).safeParse({
    scheduleId:formData.get("scheduleId"), periodId:formData.get("periodId"), startsAt:String(formData.get("startsAt")??""), endsAt:String(formData.get("endsAt")??"")
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (Boolean(parsed.data.startsAt) !== Boolean(parsed.data.endsAt)) return { message:"Provide both times, or leave both empty for Anytime." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_timetable_bell_schedule_period", {
    p_bell_schedule_id:parsed.data.scheduleId, p_timetable_period_id:parsed.data.periodId,
    p_starts_at:parsed.data.startsAt || null, p_ends_at:parsed.data.endsAt || null,
  });
  if (error) return { message:error.message || "Bell period could not be saved." };
  revalidatePath("/timetable");
  return { success:true, message:parsed.data.startsAt ? "Bell period times saved." : "Bell period set to Anytime." };
}
