"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conductRoles, type ConductActionState, type ConductPolicyType } from "../types";

async function allowed(schoolId: string, roles: string[]) {
  const context = await getUserContext();
  return Boolean(context.user && context.memberships.some(m => m.schoolId === schoolId && roles.includes(m.roleKey)));
}
const optionalText = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
function saved(message: string): ConductActionState {
  revalidatePath("/conduct");
  revalidatePath("/conduct/policy");
  revalidatePath("/school/setup");
  return { success: true, message };
}
const policyManagers = ["school_admin", "principal", "deputy_principal"];
const optionalInt = z.preprocess(value => value === "" || value === null || value === undefined ? null : Number(value), z.number().int().min(-2147483648).max(2147483647).nullable());
function internalCode(prefix: string, label: string) {
  const slug = label.toUpperCase().normalize("NFKD").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 22) || "ITEM";
  return `${prefix}_${slug}_${randomUUID().slice(0, 6).toUpperCase()}`.slice(0, 40);
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
  if (!await allowed(v.schoolId, policyManagers)) return { message: "You cannot manage this school's categories." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("upsert_conduct_policy_category", { p_school_id: v.schoolId, p_category_id: v.categoryId, p_domain: v.domain, p_direction: v.domain === "conduct" ? v.direction : null, p_code: v.code, p_display_name: v.displayName, p_default_severity: v.domain === "conduct" && v.direction === "negative" ? v.severity : null, p_points: v.points, p_sort_order: v.sortOrder, p_active: v.active });
  if (error) return { message: error.code === "23505" ? "This category code is already in use in this domain." : "Category could not be saved. Check its fields and try again." };
  return saved("Category saved.");
}
export async function archiveConductCategory(_state: ConductActionState, form: FormData): Promise<ConductActionState> {
  const schoolId = z.string().uuid().safeParse(form.get("schoolId"));
  const categoryId = z.string().uuid().safeParse(form.get("categoryId"));
  if (!schoolId.success || !categoryId.success || !await allowed(schoolId.data, policyManagers)) return { message: "You cannot archive this category." };
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


const groupSchema = z.object({
  schoolId: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  type: z.enum(["recognition", "violation"]),
  code: z.string().trim().max(40).nullable(),
  displayName: z.string().trim().min(1).max(120),
  defaultPoints: optionalInt,
  severity: z.enum(["routine", "moderate", "serious", "critical"]).nullable(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export async function saveConductGroup(_state: ConductActionState, form: FormData): Promise<ConductActionState> {
  const parsed = groupSchema.safeParse({
    schoolId: form.get("schoolId"),
    groupId: optionalText(form.get("groupId")),
    type: form.get("type"),
    code: optionalText(form.get("code")),
    displayName: form.get("displayName"),
    defaultPoints: form.get("defaultPoints"),
    severity: optionalText(form.get("severity")),
    sortOrder: form.get("sortOrder"),
  });
  if (!parsed.success) return { message: "Check the group name, points and severity." };
  const v = parsed.data;
  if (!await allowed(v.schoolId, policyManagers)) return { message: "You cannot manage this school's conduct policy." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("upsert_conduct_policy_group", {
    p_school_id: v.schoolId,
    p_group_id: v.groupId,
    p_type: v.type,
    p_code: v.code ?? internalCode("GRP", v.displayName),
    p_display_name: v.displayName,
    p_default_points: v.defaultPoints,
    p_default_severity: v.type === "violation" ? v.severity : null,
    p_sort_order: v.sortOrder,
    p_active: true,
  });
  if (error) return { message: error.code === "23505" ? "A group with this internal identity already exists." : "Conduct group could not be saved." };
  return saved(v.groupId ? "Conduct group updated." : "Conduct group added.");
}

const itemSchema = z.object({
  schoolId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  groupId: z.string().uuid(),
  type: z.enum(["recognition", "violation"]),
  domain: z.enum(["conduct", "achievement"]),
  code: z.string().trim().max(40).nullable(),
  displayName: z.string().trim().min(1).max(120),
  points: optionalInt,
  severity: z.enum(["routine", "moderate", "serious", "critical"]).nullable(),
  managementAttention: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export async function saveConductPolicyItem(_state: ConductActionState, form: FormData): Promise<ConductActionState> {
  const parsed = itemSchema.safeParse({
    schoolId: form.get("schoolId"),
    categoryId: optionalText(form.get("categoryId")),
    groupId: form.get("groupId"),
    type: form.get("type"),
    domain: form.get("domain") || "conduct",
    code: optionalText(form.get("code")),
    displayName: form.get("displayName"),
    points: form.get("points"),
    severity: optionalText(form.get("severity")),
    managementAttention: form.get("managementAttention") === "true",
    sortOrder: form.get("sortOrder"),
  });
  if (!parsed.success) return { message: "Check the conduct item, group, points and severity." };
  const v = parsed.data;
  if (!await allowed(v.schoolId, policyManagers)) return { message: "You cannot manage this school's conduct policy." };
  const direction = v.domain === "achievement" ? null : v.type === "recognition" ? "positive" : "negative";
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("upsert_conduct_policy_category", {
    p_school_id: v.schoolId,
    p_category_id: v.categoryId,
    p_group_id: v.groupId,
    p_domain: v.domain,
    p_direction: direction,
    p_code: v.code ?? internalCode("ITEM", v.displayName),
    p_display_name: v.displayName,
    p_default_severity: v.type === "violation" ? v.severity : null,
    p_points: v.points,
    p_requires_management_attention: v.type === "violation" ? v.managementAttention : false,
    p_sort_order: v.sortOrder,
    p_active: true,
  });
  if (error) return { message: error.code === "23505" ? "This conduct item already exists." : "Conduct item could not be saved." };
  return saved(v.categoryId ? "Conduct item updated." : "Conduct item added.");
}

async function simplePolicyRpc(form: FormData, idField: "groupId" | "categoryId", rpc: string, arg: string, success: string) {
  const schoolId = z.string().uuid().safeParse(form.get("schoolId"));
  const id = z.string().uuid().safeParse(form.get(idField));
  if (!schoolId.success || !id.success || !await allowed(schoolId.data, policyManagers)) return { message: "You cannot manage this conduct policy." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc(rpc, { [arg]: id.data });
  return error ? { message: error.message.includes("historical references") ? error.message : "The conduct policy change could not be saved." } : saved(success);
}

export async function archiveConductGroup(_state: ConductActionState, form: FormData) {
  return simplePolicyRpc(form, "groupId", "retire_conduct_policy_group", "p_group_id", "Conduct group archived.");
}
export async function restoreConductGroup(_state: ConductActionState, form: FormData) {
  return simplePolicyRpc(form, "groupId", "restore_conduct_policy_group", "p_group_id", "Conduct group restored.");
}
export async function deleteConductGroup(_state: ConductActionState, form: FormData) {
  return simplePolicyRpc(form, "groupId", "delete_unused_conduct_policy_group", "p_group_id", "Unused conduct group deleted.");
}
export async function restoreConductPolicyItem(_state: ConductActionState, form: FormData) {
  return simplePolicyRpc(form, "categoryId", "restore_conduct_policy_category", "p_category_id", "Conduct item restored.");
}
export async function deleteConductPolicyItem(_state: ConductActionState, form: FormData) {
  return simplePolicyRpc(form, "categoryId", "delete_unused_conduct_policy_category", "p_category_id", "Unused conduct item deleted.");
}
export async function archiveConductPolicyItem(_state: ConductActionState, form: FormData) {
  return simplePolicyRpc(form, "categoryId", "retire_conduct_policy_category", "p_category_id", "Conduct item archived.");
}

async function movePolicy(form: FormData, kind: "group" | "item"): Promise<ConductActionState> {
  const schoolId = z.string().uuid().safeParse(form.get("schoolId"));
  const id = z.string().uuid().safeParse(form.get(kind === "group" ? "groupId" : "categoryId"));
  const move = z.enum(["up", "down"]).safeParse(form.get("move"));
  if (!schoolId.success || !id.success || !move.success || !await allowed(schoolId.data, policyManagers)) return { message: "You cannot reorder this conduct policy." };
  const db = await createSupabaseServerClient();
  const { error } = kind === "group"
    ? await db.rpc("reorder_conduct_policy_group", { p_group_id: id.data, p_move: move.data })
    : await db.rpc("reorder_conduct_policy_category", { p_category_id: id.data, p_move: move.data });
  return error ? { message: "The conduct policy order could not be changed." } : saved("Conduct policy order updated.");
}
export async function moveConductGroup(_state: ConductActionState, form: FormData) { return movePolicy(form, "group"); }
export async function moveConductPolicyItem(_state: ConductActionState, form: FormData) { return movePolicy(form, "item"); }

export async function initializeConductStarterPolicy(_state: ConductActionState, form: FormData): Promise<ConductActionState> {
  const schoolId = z.string().uuid().safeParse(form.get("schoolId"));
  if (!schoolId.success || !await allowed(schoolId.data, policyManagers)) return { message: "You cannot set up this conduct policy." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("ensure_conduct_starter_policy", { p_school_id: schoolId.data });
  return error ? { message: "Starter conduct policy could not be created." } : saved("Starter conduct policy is ready.");
}
