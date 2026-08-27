import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcademicTermSummary = {
  id: string;
  number: number;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
};

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
