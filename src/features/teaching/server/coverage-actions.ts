"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user-context";

export type CoverageActionState = {
  success: boolean;
  message: string;
};

// Coverage states from the canonical teaching_actuals check constraint.
const COVERAGE_STATES = [
  "not_started",
  "started",
  "partially_taught",
  "taught",
  "reinforcement_needed",
  "assessed",
] as const;

const recordSchema = z.object({
  scheduleItemId: z.string().uuid("Invalid schedule item."),
  taughtOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Taught date is required.")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Taught date must be a valid date."),
  periodsUsed: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1, "At least one period is required.").max(20)),
  coverageState: z.enum(COVERAGE_STATES, {
    error: "Select a coverage state.",
  }),
  reflection: z.string().trim().max(3000).optional(),
  compensatoryAction: z.string().trim().max(2000).optional(),
});

function coverageErrorMessage(message: string | undefined): string {
  const detail = (message ?? "").toLowerCase();
  if (detail.includes("permission denied") || detail.includes("authorized")) {
    return "You do not have current teaching authority for this schedule item.";
  }
  if (detail.includes("recorder mismatch")) {
    return "You are not authorized to record an actual for this allocation.";
  }
  if (detail.includes("scope mismatch")) {
    return "The schedule item is not valid for your current school.";
  }
  return "The actual could not be recorded. Please try again.";
}

/**
 * Record a teaching actual for an existing schedule item.
 *
 * Authority model (enforced in layers):
 *   1. Authenticated session required.
 *   2. Platform roles excluded — coverage is school-operational.
 *   3. School membership must be teacher or class_teacher.
 *   4. The DB trigger enforce_teaching_actual_scope_integrity re-checks exact
 *      recorder ownership/effective placement and blocks root provenance mutation.
 *   5. RLS "recording teacher can create teaching actuals" requires
 *      recorded_by_user_id = auth.uid() and the governed recorder predicate on
 *      the linked schedule item's school/allocation/taught date.
 *
 * Planned teaching (teaching_schedule_items) is never modified. UPDATE and
 * DELETE on teaching_actuals are revoked from authenticated. Historical records
 * are therefore append-only from the application layer.
 */
export async function recordTeachingActual(
  _state: CoverageActionState,
  formData: FormData,
): Promise<CoverageActionState> {
  const parsed = recordSchema.safeParse({
    scheduleItemId: formData.get("scheduleItemId"),
    taughtOn: formData.get("taughtOn"),
    periodsUsed: formData.get("periodsUsed"),
    coverageState: formData.get("coverageState"),
    reflection: formData.get("reflection") ?? "",
    compensatoryAction: formData.get("compensatoryAction") ?? "",
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Check the form and try again.";
    return { success: false, message: first };
  }

  const context = await getUserContext();
  if (!context.user) {
    return { success: false, message: "Your session has ended. Sign in again to continue." };
  }

  // Platform roles carry no school-operational authority.
  if (context.platformMemberships.length) {
    return { success: false, message: "Platform accounts cannot record teaching actuals." };
  }

  const supabase = await createSupabaseServerClient();

  // Resolve tenant_id and school_id from the schedule item under the caller's
  // current-school RLS boundary. If the item is not visible the select returns
  // nothing and we report a safe not-found error.
  const { data: item, error: itemError } = await supabase
    .from("teaching_schedule_items")
    .select("id,tenant_id,school_id")
    .eq("id", parsed.data.scheduleItemId)
    .maybeSingle();

  if (itemError) {
    return { success: false, message: "The schedule item could not be verified. Please try again." };
  }

  if (!item) {
    return { success: false, message: "Schedule item not found or not accessible in your current school." };
  }

  const { data, error } = await supabase
    .from("teaching_actuals")
    .insert({
      tenant_id: item.tenant_id,
      school_id: item.school_id,
      teaching_schedule_item_id: item.id,
      taught_on: parsed.data.taughtOn,
      periods_used: parsed.data.periodsUsed,
      coverage_state: parsed.data.coverageState,
      reflection: parsed.data.reflection || null,
      compensatory_action: parsed.data.compensatoryAction || null,
      recorded_by_user_id: context.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, message: coverageErrorMessage(error?.message) };
  }

  revalidatePath("/teaching/coverage");
  revalidatePath("/teaching");

  return {
    success: true,
    message: "Teaching actual recorded. The planned schedule item is unchanged.",
  };
}
