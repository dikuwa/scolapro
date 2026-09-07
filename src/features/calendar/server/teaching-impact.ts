import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BellScheduleSummary } from "@/features/timetable/server/bell-calendar";

export type TeachingImpactRow={ id:string; date:string; impact:string; reason:string|null; bellScheduleName:string|null };
export async function getTeachingImpactWorkspace(schoolId:string,academicYear:number){
  const supabase=await createSupabaseServerClient();
  const [overrideResult,scheduleResult]=await Promise.all([
    supabase.from("school_day_overrides").select("id,school_date,teaching_impact,reason,bell_schedule_id,timetable_bell_schedules(display_name)").eq("school_id",schoolId).gte("school_date",`${academicYear}-01-01`).lte("school_date",`${academicYear}-12-31`).order("school_date",{ascending:false}).limit(20),
    supabase.from("timetable_bell_schedules").select("id,display_name,effective_from,effective_to,applies_to_weekdays").eq("school_id",schoolId).eq("academic_year",academicYear).order("effective_from",{ascending:false}),
  ]);
  if(overrideResult.error||scheduleResult.error) throw new Error("Unable to load teaching-impact calendar data.");
  return {
    overrides:(overrideResult.data??[]).map(item=>({id:item.id,date:item.school_date,impact:item.teaching_impact,reason:item.reason,bellScheduleName:(item.timetable_bell_schedules as {display_name?:string}|null)?.display_name??null})) as TeachingImpactRow[],
    schedules:(scheduleResult.data??[]).map(item=>({id:item.id,name:item.display_name,effectiveFrom:item.effective_from,effectiveTo:item.effective_to,weekdays:item.applies_to_weekdays??[]})) as BellScheduleSummary[],
  };
}
