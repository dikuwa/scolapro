"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conductRoles, type ConductActionState } from "../types";

async function allowed(schoolId: string, roles: string[]) {
  const context = await getUserContext();
  return Boolean(context.user && context.memberships.some(m => m.schoolId === schoolId && roles.includes(m.roleKey)));
}
const optionalText = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
function saved(message: string): ConductActionState {
  revalidatePath("/conduct"); revalidatePath("/school/setup");
  return { success: true, message };
}
const categorySchema = z.object({
  schoolId: z.string().uuid(), categoryId: z.string().uuid().nullable(), domain: z.enum(["conduct", "achievement"]),
  direction: z.enum(["positive", "negative"]).nullable(), code: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(120), severity: z.enum(["routine", "moderate", "serious", "critical"]).nullable(),
  points: z.coerce.number().int().min(-2147483648).max(2147483647).nullable(), sortOrder: z.coerce.number().int().min(0).max(10000), active: z.boolean(),
});
export async function saveConductCategory(_state: ConductActionState, form: FormData): Promise<ConductActionState> {
  const parsed = categorySchema.safeParse({ schoolId: form.get("schoolId"), categoryId: optionalText(form.get("categoryId")), domain: form.get("domain"), direction: optionalText(form.get("direction")), code: form.get("code"), displayName: form.get("displayName"), severity: optionalText(form.get("severity")), points: optionalText(form.get("points")), sortOrder: form.get("sortOrder"), active: form.get("active") === "true" });
  if (!parsed.success) return { message: "Check the category name, code and numeric fields." };
  const v = parsed.data;
  if (!await allowed(v.schoolId, ["school_admin", "principal"])) return { message: "You cannot manage this school's categories." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("upsert_conduct_policy_category", { p_school_id: v.schoolId, p_category_id: v.categoryId, p_domain: v.domain, p_direction: v.domain === "conduct" ? v.direction : null, p_code: v.code, p_display_name: v.displayName, p_default_severity: v.domain === "conduct" && v.direction === "negative" ? v.severity : null, p_points: v.points, p_sort_order: v.sortOrder, p_active: v.active });
  if (error) return { message: error.code === "23505" ? "This category code is already in use in this domain." : "Category could not be saved. Check its fields and try again." };
  return saved("Category saved.");
}
export async function archiveConductCategory(_state: ConductActionState, form: FormData): Promise<ConductActionState> {
  const schoolId = z.string().uuid().safeParse(form.get("schoolId"));
  const categoryId = z.string().uuid().safeParse(form.get("categoryId"));
  if (!schoolId.success || !categoryId.success || !await allowed(schoolId.data, ["school_admin", "principal"])) return { message: "You cannot archive this category." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("retire_conduct_policy_category", { p_category_id: categoryId.data });
  return error ? { message: "Category could not be archived." } : saved("Category archived. Existing history is preserved.");
}
const eventSchema = z.object({ schoolId: z.string().uuid(), categoryId: z.string().uuid(), domain: z.enum(["conduct", "achievement"]), date: z.string().date(), title: z.string().trim().min(1).max(240), details: z.string().trim().max(10000), severity: z.enum(["routine", "moderate", "serious", "critical"]), level: z.enum(["class", "school", "circuit", "regional", "national", "international", "other"]), learnerIds: z.array(z.string().uuid()).min(1).max(200) });
export async function recordConductEvent(_state: ConductActionState, form: FormData): Promise<ConductActionState> {
  const parsed = eventSchema.safeParse({ schoolId: form.get("schoolId"), categoryId: form.get("categoryId"), domain: form.get("domain"), date: form.get("date"), title: form.get("title"), details: form.get("details") ?? "", severity: form.get("severity") ?? "routine", level: form.get("level") ?? "school", learnerIds: form.getAll("learnerIds") });
  if (!parsed.success) return { message: "Choose learners and a category, then check the date and required text." };
  const v = parsed.data;
  if (!await allowed(v.schoolId, conductRoles.filter(r => v.domain === "conduct" || r !== "counsellor"))) return { message: "You cannot record this event." };
  const db = await createSupabaseServerClient();
  const common = { p_school_id: v.schoolId, p_category_id: v.categoryId, p_learner_ids: [...new Set(v.learnerIds)] };
  const { error } = v.domain === "conduct"
    ? await db.rpc("create_conduct_event_group", { ...common, p_severity: v.severity, p_summary: v.title, p_details: v.details, p_occurred_on: v.date })
    : await db.rpc("create_achievement_event_group", { ...common, p_title: v.title, p_description: v.details, p_level: v.level, p_achieved_on: v.date });
  if (error) return { message: "Event could not be saved. Check your learner access, enrolment date and whether the category is still active." };
  return saved(v.domain === "conduct" ? "Incident recorded." : "Achievement recorded.");
}
