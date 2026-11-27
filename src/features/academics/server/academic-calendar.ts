import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcademicCalendarTerm = {
  id: string;
  termNumber: number;
  displayName: string;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
};

export type AcademicCalendarYear = {
  id: string;
  year: number;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  terms: AcademicCalendarTerm[];
};

export type AcademicCalendarWorkspace = {
  /** The year the rest of the product currently operates on. */
  currentYear: number;
  years: AcademicCalendarYear[];
};

function str(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

/**
 * Reads the configured academic years and terms for a school.
 *
 * This is intentionally a school-management read model: it is what an operator
 * needs to create the next year so year-end progression can publish into it.
 */
export async function getAcademicCalendarWorkspace(schoolId: string): Promise<AcademicCalendarWorkspace> {
  const supabase = await createSupabaseServerClient();

  const { data: yearRows, error: yearError } = await supabase
    .from("academic_years")
    .select("id,year,status,starts_on,ends_on")
    .eq("school_id", schoolId)
    .order("year", { ascending: false })
    .limit(12);
  if (yearError) throw new Error("Unable to load the academic calendar.");

  const years = (yearRows ?? []) as Array<Record<string, unknown>>;
  const yearIds = years.map((row) => String(row.id));

  const termsByYear = new Map<string, AcademicCalendarTerm[]>();
  if (yearIds.length) {
    const { data: termRows, error: termError } = await supabase
      .from("academic_terms")
      .select("id,academic_year_id,term_number,display_name,starts_on,ends_on,status")
      .in("academic_year_id", yearIds)
      .order("term_number", { ascending: true });
    if (termError) throw new Error("Unable to load the academic terms.");
    for (const row of (termRows ?? []) as Array<Record<string, unknown>>) {
      const key = String(row.academic_year_id);
      const list = termsByYear.get(key) ?? [];
      list.push({
        id: String(row.id),
        termNumber: Number(row.term_number),
        displayName: String(row.display_name),
        startsOn: str(row.starts_on),
        endsOn: str(row.ends_on),
        status: String(row.status),
      });
      termsByYear.set(key, list);
    }
  }

  const mapped: AcademicCalendarYear[] = years.map((row) => ({
    id: String(row.id),
    year: Number(row.year),
    status: String(row.status),
    startsOn: str(row.starts_on),
    endsOn: str(row.ends_on),
    terms: termsByYear.get(String(row.id)) ?? [],
  }));

  const currentYear =
    mapped.find((item) => item.status === "active")?.year ??
    mapped.find((item) => item.status === "setup")?.year ??
    mapped[0]?.year ??
    new Date().getFullYear();

  return { currentYear, years: mapped };
}
