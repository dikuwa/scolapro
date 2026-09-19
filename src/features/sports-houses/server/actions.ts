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


export type SportsBalanceTotal = {
  houseId: string;
  houseName: string;
  total: number;
};

export type SportsBalanceMove = {
  id: string;
  entityType: "learner" | "staff";
  entityId: string;
  name: string;
  fromHouseId: string | null;
  fromHouseName: string | null;
  toHouseId: string;
  toHouseName: string;
  assignmentSource: string | null;
  isLocked: boolean;
  staffRoleKey: string | null;
  sex: string | null;
  ageGroup: string | null;
  grade: string | null;
};

export type SportsBalancePreview = {
  id: string;
  academicYear: number;
  scope: "learner" | "staff";
  algorithmVersion: string;
  status: "preview" | "applied";
  createdAt: string;
  appliedAt: string | null;
  moveCount: number;
  beforeTotals: SportsBalanceTotal[];
  afterTotals: SportsBalanceTotal[];
  moves: SportsBalanceMove[];
  configuration: {
    balanceBySex: boolean;
    balanceByAgeGroup: boolean;
    balanceByGrade: boolean;
    ageReferenceDate: string | null;
  };
};

export type SportsBalanceActionState = SportsHousesActionState & {
  preview?: SportsBalancePreview;
  nextOperationId?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asTotals(value: unknown): SportsBalanceTotal[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = asRecord(entry);
    return {
      houseId: String(row.house_id ?? ""),
      houseName: String(row.house_name ?? "House"),
      total: Number(row.total ?? 0),
    };
  }).filter((row) => row.houseId);
}

function normalizeBalancePreview(value: unknown): SportsBalancePreview | null {
  const row = asRecord(value);
  const id = typeof row.id === "string" ? row.id : "";
  const scope = row.scope === "staff" ? "staff" : row.scope === "learner" ? "learner" : null;
  if (!id || !scope) return null;

  const configuration = asRecord(row.configuration);
  const moves = Array.isArray(row.moves) ? row.moves.map((entry) => {
    const move = asRecord(entry);
    return {
      id: String(move.id ?? ""),
      entityType: move.entity_type === "staff" ? "staff" as const : "learner" as const,
      entityId: String(move.entity_id ?? ""),
      name: String(move.name ?? (move.entity_type === "staff" ? "Staff member" : "Learner")),
      fromHouseId: typeof move.from_house_id === "string" ? move.from_house_id : null,
      fromHouseName: typeof move.from_house_name === "string" ? move.from_house_name : null,
      toHouseId: String(move.to_house_id ?? ""),
      toHouseName: String(move.to_house_name ?? "House"),
      assignmentSource: typeof move.assignment_source === "string" ? move.assignment_source : null,
      isLocked: Boolean(move.is_locked),
      staffRoleKey: typeof move.staff_role_key === "string" ? move.staff_role_key : null,
      sex: typeof move.sex === "string" ? move.sex : null,
      ageGroup: typeof move.age_group === "string" ? move.age_group : null,
      grade: typeof move.grade === "string" ? move.grade : null,
    };
  }).filter((move) => move.id && move.entityId && move.toHouseId) : [];

  return {
    id,
    academicYear: Number(row.academic_year ?? 0),
    scope,
    algorithmVersion: String(row.algorithm_version ?? "deterministic-greedy-v1"),
    status: row.status === "applied" ? "applied" : "preview",
    createdAt: String(row.created_at ?? ""),
    appliedAt: typeof row.applied_at === "string" ? row.applied_at : null,
    moveCount: Number(row.move_count ?? moves.length),
    beforeTotals: asTotals(row.before_totals),
    afterTotals: asTotals(row.after_totals),
    moves,
    configuration: {
      balanceBySex: Boolean(configuration.balance_by_sex),
      balanceByAgeGroup: Boolean(configuration.balance_by_age_group),
      balanceByGrade: Boolean(configuration.balance_by_grade),
      ageReferenceDate: typeof configuration.age_reference_date === "string" ? configuration.age_reference_date : null,
    },
  };
}

async function loadBalancePreview(runId: string): Promise<SportsBalancePreview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_sports_house_balancing_run", { p_run_id: runId });
  if (error) return null;
  return normalizeBalancePreview(data);
}

export async function previewSportsHouseBalancing(
  _state: SportsBalanceActionState,
  formData: FormData,
): Promise<SportsBalanceActionState> {
  const parsed = z.object({
    schoolId: uuid,
    academicYear: z.coerce.number().int().min(2000).max(2200),
    scope: z.enum(["learner", "staff"]),
    clientOperationId: uuid,
  }).safeParse({
    schoolId: value(formData, "schoolId"),
    academicYear: value(formData, "academicYear"),
    scope: value(formData, "scope"),
    clientOperationId: value(formData, "clientOperationId"),
  });
  if (!parsed.success) return { message: "Choose a valid balancing scope and academic year." };
  if (!(await canManageSports(parsed.data.schoolId))) return { message: "You do not have permission to balance houses for this school." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_sports_house_balancing", {
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_balance_scope: parsed.data.scope,
    p_client_operation_id: parsed.data.clientOperationId,
  });
  if (error) {
    return {
      message: errorMessage(
        error.message,
        error.message.includes("At least two active houses")
          ? "At least two active houses are required before balancing."
          : "The balance preview could not be created.",
      ),
    };
  }

  const runId = typeof data === "string" ? data : "";
  const preview = runId ? await loadBalancePreview(runId) : null;
  if (!preview) return { message: "The balance preview was created but could not be loaded." };

  return {
    success: true,
    message: preview.moveCount ? `Preview ready with ${preview.moveCount} proposed ${preview.moveCount === 1 ? "move" : "moves"}.` : "Preview ready. No moves are needed.",
    preview,
    nextOperationId: crypto.randomUUID(),
  };
}

export async function applySportsHouseBalancing(
  _state: SportsBalanceActionState,
  formData: FormData,
): Promise<SportsBalanceActionState> {
  const parsed = z.object({ schoolId: uuid, runId: uuid }).safeParse({
    schoolId: value(formData, "schoolId"),
    runId: value(formData, "runId"),
  });
  if (!parsed.success) return { message: "The balancing preview reference is invalid." };
  if (!(await canManageSports(parsed.data.schoolId))) return { message: "You do not have permission to apply house balancing for this school." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("apply_sports_house_balancing", { p_run_id: parsed.data.runId });
  if (error) {
    const stale = error.message.includes("preview is stale");
    return {
      message: stale
        ? "This preview is stale because assignments changed. Create a fresh preview before applying."
        : errorMessage(error.message, "The balance could not be applied. No partial changes were kept."),
    };
  }

  const preview = await loadBalancePreview(parsed.data.runId);
  revalidatePath("/school/sports-houses");
  return {
    success: true,
    message: "House balance applied with audit evidence.",
    preview: preview ?? undefined,
  };
}
