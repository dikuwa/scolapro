"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcademicCalendarState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
};

const dateInput = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");

const yearSchema = z.object({
  schoolId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2200),
  startsOn: dateInput,
  endsOn: dateInput,
});

const termSchema = z.object({
  academicYearId: z.string().uuid("Choose an academic year."),
  termNumber: z.coerce.number().int().min(1).max(6),
  displayName: z.string().trim().min(1, "Term name is required.").max(80),
  startsOn: dateInput,
  endsOn: dateInput,
});

/**
 * Academic year and term configuration is a school-management action. The RPC
 * also enforces the deterministic current school and terminal-year finality; this
 * check keeps the UI honest and gives a clear message instead of a raw SQL error.
 */
async function canManageAcademicCalendar(schoolId: string) {
  const context = await getUserContext();
  if (!context.user) return false;
  if (context.platformMemberships.some((membership) => membership.roleKey === "platform_admin")) return true;
  return context.memberships.some(
    (membership) =>
      membership.schoolId === schoolId &&
      (membership.roleKey === "school_admin" || membership.roleKey === "principal"),
  );
}

function rangeError(start: string, end: string) {
  return end < start ? "The end date cannot be before the start date." : null;
}

export async function configureAcademicYear(
  _previous: AcademicCalendarState,
  formData: FormData,
): Promise<AcademicCalendarState> {
  const parsed = yearSchema.safeParse({
    schoolId: formData.get("schoolId"),
    year: formData.get("year"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const range = rangeError(parsed.data.startsOn, parsed.data.endsOn);
  if (range) return { message: range };
  if (!(await canManageAcademicCalendar(parsed.data.schoolId))) {
    return { message: "You do not have permission to configure this school's academic calendar." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("configure_academic_year", {
    p_school_id: parsed.data.schoolId,
    p_year: parsed.data.year,
    p_starts_on: parsed.data.startsOn,
    p_ends_on: parsed.data.endsOn,
  });
  if (error) return { message: error.message || "The academic year could not be saved." };

  revalidatePath("/school/setup");
  revalidatePath("/school/progression");
  revalidatePath("/calendar");
  return { success: true, message: `Academic year ${parsed.data.year} saved.` };
}

export async function configureAcademicTerm(
  _previous: AcademicCalendarState,
  formData: FormData,
): Promise<AcademicCalendarState> {
  const parsed = termSchema.safeParse({
    academicYearId: formData.get("academicYearId"),
    termNumber: formData.get("termNumber"),
    displayName: formData.get("displayName"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const range = rangeError(parsed.data.startsOn, parsed.data.endsOn);
  if (range) return { message: range };

  const supabase = await createSupabaseServerClient();
  const { data: year, error: yearError } = await supabase
    .from("academic_years")
    .select("school_id,status,starts_on,ends_on")
    .eq("id", parsed.data.academicYearId)
    .maybeSingle();
  if (yearError || !year) return { message: "The academic year could not be found." };
  if (!(await canManageAcademicCalendar(year.school_id))) {
    return { message: "You do not have permission to configure this school's academic calendar." };
  }
  if (year.status === "closed") return { message: "A closed academic year is final and cannot be changed." };
  if (year.starts_on && parsed.data.startsOn < year.starts_on || year.ends_on && parsed.data.endsOn > year.ends_on) {
    return { message: "Term dates must stay within the configured academic year." };
  }

  const { data: existingTerms, error: termsError } = await supabase
    .from("academic_terms")
    .select("term_number,starts_on,ends_on,status")
    .eq("academic_year_id", parsed.data.academicYearId)
    .order("term_number", { ascending: true });
  if (termsError) return { message: "The existing academic terms could not be checked." };
  const neighbors = (existingTerms ?? [])
    .filter((term) => Number(term.term_number) !== parsed.data.termNumber)
    .filter((term) => term.starts_on && term.ends_on);
  const previous = neighbors.filter((term) => Number(term.term_number) < parsed.data.termNumber).at(-1);
  const next = neighbors.find((term) => Number(term.term_number) > parsed.data.termNumber);
  if (previous?.ends_on && parsed.data.startsOn <= previous.ends_on) {
    return { message: "The term must start after the previous configured term ends." };
  }
  if (next?.starts_on && parsed.data.endsOn >= next.starts_on) {
    return { message: "The term must end before the next configured term starts." };
  }

  const { error } = await supabase.rpc("configure_academic_term", {
    p_academic_year_id: parsed.data.academicYearId,
    p_term_number: parsed.data.termNumber,
    p_display_name: parsed.data.displayName,
    p_starts_on: parsed.data.startsOn,
    p_ends_on: parsed.data.endsOn,
  });
  if (error) return { message: error.message || "The academic term could not be saved." };

  revalidatePath("/school/setup");
  revalidatePath("/assessment/results");
  revalidatePath("/calendar");
  return { success: true, message: `${parsed.data.displayName} saved.` };
}
