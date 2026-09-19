"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SportsHousesActionState = {
  success?: boolean;
  message?: string;
};

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const uuid = z.string().uuid();
const optionalUuid = z.union([z.string().uuid(), z.literal("")]);
const optionalAge = z.preprocess(
  (value) => value === "" || value === null ? undefined : Number(value),
  z.number().int().min(3).max(30).optional(),
);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

async function canManageSports(schoolId: string) {
  const context = await getUserContext();
  if (!context.user) return false;
  if (context.platformMemberships.some((item) => item.roleKey === "platform_support")) return false;
  if (context.platformMemberships.some((item) => item.roleKey === "platform_admin")) return true;
  return context.memberships.some((item) => item.schoolId === schoolId && managerRoles.has(item.roleKey));
}

function errorMessage(message: string, fallback: string) {
  const allowed = [
    "House name is required",
    "House colour must be a six-digit hex value",
    "House status must be active or inactive",
    "House not found in this school",
    "Age group label is required",
    "Active sports age groups may not overlap",
    "Permission denied",
    "Learner must have an enrolment at the school for the sports year",
    "Staff member must have a school placement overlapping the sports year",
    "Sports house must belong to the same tenant and school",
  ];
  return allowed.find((item) => message.includes(item)) ?? fallback;
}

export async function saveSportsHouse(_state: SportsHousesActionState, formData: FormData): Promise<SportsHousesActionState> {
  const parsed = z.object({
    schoolId: uuid,
    houseId: optionalUuid,
    name: z.string().trim().min(1).max(120),
    shortCode: z.string().trim().max(24).optional(),
    colorHex: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal("")]),
    sortOrder: z.coerce.number().int().min(-1000).max(1000),
  }).safeParse({
    schoolId: value(formData, "schoolId"),
    houseId: value(formData, "houseId"),
    name: value(formData, "name"),
    shortCode: value(formData, "shortCode"),
    colorHex: value(formData, "colorHex"),
    sortOrder: value(formData, "sortOrder"),
  });
  if (!parsed.success) return { message: "Enter a valid house name, optional code, six-digit hex colour and display order." };
  if (!(await canManageSports(parsed.data.schoolId))) return { message: "You do not have permission to manage Sports / Houses for this school." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_sports_house", {
    p_school_id: parsed.data.schoolId,
    p_name: parsed.data.name,
    p_short_code: parsed.data.shortCode || null,
    p_color_hex: parsed.data.colorHex || null,
    p_sort_order: parsed.data.sortOrder,
    p_house_id: parsed.data.houseId || null,
  });
  if (error) return { message: errorMessage(error.message, "The house could not be saved. Review the values and try again.") };

  revalidatePath("/school/sports-houses");
  return { success: true, message: parsed.data.houseId ? "House updated." : "House created." };
}

export async function changeSportsHouseStatus(_state: SportsHousesActionState, formData: FormData): Promise<SportsHousesActionState> {
  const parsed = z.object({
    schoolId: uuid,
    houseId: uuid,
    status: z.enum(["active", "inactive"]),
  }).safeParse({
    schoolId: value(formData, "schoolId"),
    houseId: value(formData, "houseId"),
    status: value(formData, "status"),
  });
  if (!parsed.success) return { message: "Choose a valid house status." };
  if (!(await canManageSports(parsed.data.schoolId))) return { message: "You do not have permission to change this house." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_sports_house_status", {
    p_school_id: parsed.data.schoolId,
    p_house_id: parsed.data.houseId,
    p_status: parsed.data.status,
  });
  if (error) return { message: errorMessage(error.message, "The house status could not be changed.") };

  revalidatePath("/school/sports-houses");
  return { success: true, message: parsed.data.status === "active" ? "House activated." : "House deactivated." };
}

export async function saveSportsAgeGroup(_state: SportsHousesActionState, formData: FormData): Promise<SportsHousesActionState> {
  const parsed = z.object({
    schoolId: uuid,
    groupId: optionalUuid,
    label: z.string().trim().min(1).max(80),
    minAge: optionalAge,
    maxAge: optionalAge,
    sortOrder: z.coerce.number().int().min(-1000).max(1000),
  }).refine((data) => data.minAge === undefined || data.maxAge === undefined || data.minAge <= data.maxAge, {
    message: "Minimum age cannot exceed maximum age.",
  }).safeParse({
    schoolId: value(formData, "schoolId"),
    groupId: value(formData, "groupId"),
    label: value(formData, "label"),
    minAge: value(formData, "minAge"),
    maxAge: value(formData, "maxAge"),
    sortOrder: value(formData, "sortOrder"),
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Enter a valid age-group label and age range." };
  if (!(await canManageSports(parsed.data.schoolId))) return { message: "You do not have permission to manage Sports / Houses for this school." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_sports_age_group", {
    p_school_id: parsed.data.schoolId,
    p_label: parsed.data.label,
    p_min_age: parsed.data.minAge ?? null,
    p_max_age: parsed.data.maxAge ?? null,
    p_sort_order: parsed.data.sortOrder,
    p_group_id: parsed.data.groupId || null,
  });
  if (error) return { message: errorMessage(error.message, "The age group could not be saved. Review the range and try again.") };

  revalidatePath("/school/sports-houses");
  return { success: true, message: parsed.data.groupId ? "Age group updated." : "Age group created." };
}

export async function assignLearnerSportsHouse(_state: SportsHousesActionState, formData: FormData): Promise<SportsHousesActionState> {
  const parsed = z.object({
    schoolId: uuid,
    academicYear: z.coerce.number().int().min(2000).max(2200),
    learnerId: uuid,
    houseId: uuid,
    isLocked: z.enum(["true", "false"]),
  }).safeParse({
    schoolId: value(formData, "schoolId"),
    academicYear: value(formData, "academicYear"),
    learnerId: value(formData, "learnerId"),
    houseId: value(formData, "houseId"),
    isLocked: value(formData, "isLocked"),
  });
  if (!parsed.success) return { message: "Choose a valid learner and active house." };
  if (!(await canManageSports(parsed.data.schoolId))) return { message: "You do not have permission to assign learners to houses." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_learner_sports_house", {
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_learner_id: parsed.data.learnerId,
    p_house_id: parsed.data.houseId,
    p_assignment_source: "manual",
    p_is_locked: parsed.data.isLocked === "true",
  });
  if (error) return { message: errorMessage(error.message, "The learner house assignment could not be saved.") };

  revalidatePath("/school/sports-houses");
  return { success: true, message: "Learner house assignment saved." };
}

export async function assignStaffSportsHouse(_state: SportsHousesActionState, formData: FormData): Promise<SportsHousesActionState> {
  const parsed = z.object({
    schoolId: uuid,
    academicYear: z.coerce.number().int().min(2000).max(2200),
    staffId: uuid,
    houseId: uuid,
    roleKey: z.enum(["member", "leader"]),
    isLocked: z.enum(["true", "false"]),
  }).safeParse({
    schoolId: value(formData, "schoolId"),
    academicYear: value(formData, "academicYear"),
    staffId: value(formData, "staffId"),
    houseId: value(formData, "houseId"),
    roleKey: value(formData, "roleKey"),
    isLocked: value(formData, "isLocked"),
  });
  if (!parsed.success) return { message: "Choose a valid staff member, house and house role." };
  if (!(await canManageSports(parsed.data.schoolId))) return { message: "You do not have permission to assign staff to houses." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_staff_sports_house", {
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_staff_member_id: parsed.data.staffId,
    p_house_id: parsed.data.houseId,
    p_role_key: parsed.data.roleKey,
    p_assignment_source: "manual",
    p_is_locked: parsed.data.isLocked === "true",
  });
  if (error) return { message: errorMessage(error.message, "The staff house assignment could not be saved.") };

  revalidatePath("/school/sports-houses");
  return { success: true, message: parsed.data.roleKey === "leader" ? "House leader assignment saved." : "Staff house assignment saved." };
}
