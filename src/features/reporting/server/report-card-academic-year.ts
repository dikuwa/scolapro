import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getReportCardAcademicYear(schoolId: string): Promise<number> {
  const fallbackYear = new Date().getFullYear();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("year,status")
    .eq("school_id", schoolId)
    .order("year", { ascending: false });

  if (error) throw new Error("Unable to resolve the school academic year.");

  const years = data ?? [];
  const activeYear = years.find((item) => item.status === "active")?.year;
  if (activeYear) return activeYear;

  const configuredYear = years.find((item) => item.status === "setup")?.year ?? years[0]?.year;
  return configuredYear ?? fallbackYear;
}
