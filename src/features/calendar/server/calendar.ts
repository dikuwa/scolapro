import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcademicTermSummary = {
  id: string;
  number: number;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
};

/**
 * Resolve the school's governed academic year from the academic_years registry.
 *
 * Precedence is deliberate and matches the existing reporting read model:
 * the single activated year wins, otherwise the most recent configured year,
 * otherwise the calendar year as a last resort. Academic year is operational
 * governance (`academic_year_lifecycle_governance` guarantees at most one active
 * year per school), so it must never be inferred from the wall clock alone.
 */
export async function getGovernedAcademicYear(schoolId: string): Promise<number> {
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
  return configuredYear ?? new Date().getFullYear();
}

export async function getSchoolCalendar(schoolId: string, year: number) {
  const supabase = await createSupabaseServerClient();
  const { data: academicYear, error: yearError } = await supabase
    .from("academic_years")
    .select("id,year,status,starts_on,ends_on")
    .eq("school_id", schoolId)
    .eq("year", year)
    .maybeSingle();

  if (yearError) throw new Error("Unable to load the academic calendar.");

  if (!academicYear) {
    return { academicYear: null, terms: [] as AcademicTermSummary[] };
  }

  const { data: terms, error: termError } = await supabase
    .from("academic_terms")
    .select("id,term_number,display_name,starts_on,ends_on,status")
    .eq("academic_year_id", academicYear.id)
    .order("term_number");

  if (termError) throw new Error("Unable to load academic terms.");

  return {
    academicYear: {
      id: academicYear.id,
      year: academicYear.year,
      status: academicYear.status,
      startsOn: academicYear.starts_on,
      endsOn: academicYear.ends_on,
    },
    terms: (terms ?? []).map((term) => ({
      id: term.id,
      number: term.term_number,
      name: term.display_name,
      startsOn: term.starts_on,
      endsOn: term.ends_on,
      status: term.status,
    })),
  };
}
