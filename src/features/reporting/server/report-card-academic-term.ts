import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getReportCardAcademicTerm(schoolId: string, academicYear: number): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data: year, error: yearError } = await supabase
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("year", academicYear)
    .maybeSingle();

  if (yearError) throw new Error("Unable to resolve the report-card academic term.");
  if (!year) return 1;

  const { data, error } = await supabase
    .from("academic_terms")
    .select("term_number,status,starts_on,ends_on")
    .eq("school_id", schoolId)
    .eq("academic_year_id", year.id)
    .order("term_number", { ascending: true });

  if (error) throw new Error("Unable to resolve the report-card academic term.");
  const terms = data ?? [];
  if (!terms.length) return 1;

  const active = terms.find((term) => term.status === "active");
  if (active) return active.term_number;

  const today = new Date().toISOString().slice(0, 10);
  const dated = terms.find((term) =>
    (!term.starts_on || term.starts_on <= today) && (!term.ends_on || term.ends_on >= today),
  );
  if (dated) return dated.term_number;

  const alreadyStarted = terms
    .filter((term) => term.starts_on && term.starts_on <= today)
    .at(-1);
  if (alreadyStarted) return alreadyStarted.term_number;

  return terms[0]?.term_number ?? 1;
}
