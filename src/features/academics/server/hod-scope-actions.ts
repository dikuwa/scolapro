"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type HodScopeActionState = {
  success?: boolean;
  message?: string;
};

const portfolioSchema = z.object({
  schoolId: z.string().uuid(),
  subjectIds: z.array(z.string().uuid()).min(1).max(100),
  assignmentId: z.string().uuid(),
  departmentLabel: z.string().trim().max(120),
  effectiveFrom: z.string().date(),
  effectiveTo: z.union([z.string().date(), z.literal("")]),
});

const createSchema = z.object({
  schoolId: z.string().uuid(),
  subjectId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.union([z.string().date(), z.literal("")]),
});

const endSchema = z.object({
  schoolId: z.string().uuid(),
  responsibilityId: z.string().uuid(),
  effectiveTo: z.string().date(),
});

async function canConfigureSchool(schoolId: string) {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership = context.memberships.find(
    (item) =>
      item.schoolId === schoolId &&
      (item.roleKey === "school_admin" || item.roleKey === "principal" || item.roleKey === "deputy_principal"),
  );
  return membership ? context : null;
}

function saved(message: string): HodScopeActionState {
  revalidatePath("/school/setup");
  revalidatePath("/teaching");
  revalidatePath("/teaching/planning");
  return { success: true, message };
}

export async function saveHodSubjectPortfolio(
  _state: HodScopeActionState,
  form: FormData,
): Promise<HodScopeActionState> {
  const parsed = portfolioSchema.safeParse({
    schoolId: form.get("schoolId"),
    subjectIds: form.getAll("subjectIds"),
    assignmentId: form.get("assignmentId"),
    departmentLabel: form.get("departmentLabel") ?? "",
    effectiveFrom: form.get("effectiveFrom"),
    effectiveTo: String(form.get("effectiveTo") ?? ""),
  });
  if (!parsed.success) return { message: "Choose at least one subject, an HOD and valid effective dates." };

  const { schoolId, subjectIds, assignmentId, departmentLabel, effectiveFrom, effectiveTo } = parsed.data;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return { message: "The end date cannot be before the start date." };
  }

  const context = await canConfigureSchool(schoolId);
  if (!context?.user) return { message: "You cannot configure HOD scope for this school." };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("save_hod_subject_portfolio", {
    p_school_id: schoolId,
    p_subject_ids: [...new Set(subjectIds)],
    p_assignment_id: assignmentId,
    p_department_label: departmentLabel || null,
    p_effective_from: effectiveFrom,
    p_effective_to: effectiveTo || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { message: "One of these HOD responsibilities already starts on that date." };
    }
    if (error.code === "42501") {
      return { message: "You do not have permission to configure this HOD portfolio for the current school." };
    }
    if (error.code === "22023") {
      if (error.message.includes("effective HOD placement")) {
        return { message: "The selected HOD placement is not effective on the chosen start date." };
      }
      if (error.message.includes("At least one subject")) {
        return { message: "Choose at least one subject." };
      }
      if (error.message.includes("end date")) {
        return { message: "The end date cannot be before the start date." };
      }
      if (error.message.includes("portfolio label")) {
        return { message: "The portfolio label is too long." };
      }
    }
    return { message: "The HOD subject portfolio could not be saved. Review the selected HOD, subjects and effective dates." };
  }

  return saved("HOD subject portfolio saved.");
}

export async function createHodSubjectResponsibility(
  _state: HodScopeActionState,
  form: FormData,
): Promise<HodScopeActionState> {
  const parsed = createSchema.safeParse({
    schoolId: form.get("schoolId"),
    subjectId: form.get("subjectId"),
    assignmentId: form.get("assignmentId"),
    effectiveFrom: form.get("effectiveFrom"),
    effectiveTo: String(form.get("effectiveTo") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a subject, HOD and valid effective dates." };

  const { schoolId, subjectId, assignmentId, effectiveFrom, effectiveTo } = parsed.data;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return { message: "The end date cannot be before the start date." };
  }

  const context = await canConfigureSchool(schoolId);
  if (!context?.user) return { message: "You cannot configure HOD scope for this school." };

  const db = await createSupabaseServerClient();
  const [subjectResult, assignmentResult] = await Promise.all([
    db
      .from("subjects")
      .select("id,tenant_id,school_id")
      .eq("id", subjectId)
      .eq("school_id", schoolId)
      .maybeSingle(),
    db
      .from("staff_school_assignments")
      .select("id,tenant_id,school_id,staff_member_id,effective_from,effective_to")
      .eq("id", assignmentId)
      .eq("school_id", schoolId)
      .maybeSingle(),
  ]);

  if (subjectResult.error || assignmentResult.error || !subjectResult.data || !assignmentResult.data) {
    return { message: "The subject or HOD placement is no longer available." };
  }
  if (subjectResult.data.tenant_id !== assignmentResult.data.tenant_id) {
    return { message: "The subject and HOD placement do not belong to the same tenant." };
  }
  if (
    assignmentResult.data.effective_from > effectiveFrom ||
    (assignmentResult.data.effective_to && assignmentResult.data.effective_to < effectiveFrom)
  ) {
    return { message: "The HOD placement is not effective on the responsibility start date." };
  }

  const { data: hodMembership, error: membershipError } = await db
    .from("school_memberships")
    .select("id,active_from,active_to")
    .eq("school_id", schoolId)
    .eq("staff_member_id", assignmentResult.data.staff_member_id)
    .eq("role_key", "hod")
    .lte("active_from", effectiveFrom)
    .or(`active_to.is.null,active_to.gte.${effectiveFrom}`)
    .limit(1)
    .maybeSingle();

  if (membershipError || !hodMembership) {
    return { message: "The selected staff placement does not hold HOD responsibility on that date." };
  }

  const { error } = await db.from("subject_department_responsibilities").insert({
    tenant_id: subjectResult.data.tenant_id,
    school_id: schoolId,
    subject_id: subjectId,
    department_head_staff_assignment_id: assignmentId,
    effective_from: effectiveFrom,
    effective_to: effectiveTo || null,
    created_by_user_id: context.user.id,
  });

  if (error) {
    return {
      message:
        error.code === "23505"
          ? "That HOD responsibility already starts on this date."
          : "The HOD responsibility could not be saved.",
    };
  }

  return saved("HOD subject responsibility saved.");
}

export async function endHodSubjectResponsibility(
  _state: HodScopeActionState,
  form: FormData,
): Promise<HodScopeActionState> {
  const parsed = endSchema.safeParse({
    schoolId: form.get("schoolId"),
    responsibilityId: form.get("responsibilityId"),
    effectiveTo: form.get("effectiveTo"),
  });
  if (!parsed.success) return { message: "Choose a valid end date." };

  const context = await canConfigureSchool(parsed.data.schoolId);
  if (!context?.user) return { message: "You cannot configure HOD scope for this school." };

  const db = await createSupabaseServerClient();
  const { data: responsibility, error: readError } = await db
    .from("subject_department_responsibilities")
    .select("id,effective_from")
    .eq("id", parsed.data.responsibilityId)
    .eq("school_id", parsed.data.schoolId)
    .maybeSingle();

  if (readError || !responsibility) return { message: "That responsibility could not be found." };
  if (parsed.data.effectiveTo < responsibility.effective_from) {
    return { message: "The end date cannot be before the responsibility start date." };
  }

  const { error } = await db
    .from("subject_department_responsibilities")
    .update({ effective_to: parsed.data.effectiveTo })
    .eq("id", responsibility.id)
    .eq("school_id", parsed.data.schoolId);

  return error
    ? { message: "The HOD responsibility could not be ended." }
    : saved("HOD responsibility ended. Historical provenance is retained.");
}

const unassignedPortfolioSchema = z.object({
  schoolId: z.string().uuid(), label: z.string().trim().min(1).max(120), subjectIds: z.array(z.string().uuid()).min(1).max(100),
});
export async function createUnassignedHodPortfolio(_previous: HodScopeActionState, form: FormData): Promise<HodScopeActionState> {
  const parsed = unassignedPortfolioSchema.safeParse({ schoolId: form.get("schoolId"), label: form.get("label"), subjectIds: form.getAll("subjectIds") });
  if (!parsed.success) return { message: "Enter a portfolio name and select at least one subject." };
  if (!(await canConfigureSchool(parsed.data.schoolId))) return { message: "Only current school leadership can create portfolios." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("create_unassigned_hod_portfolio", { p_school_id: parsed.data.schoolId, p_label: parsed.data.label, p_subject_ids: [...new Set(parsed.data.subjectIds)] });
  return error ? { message: error.code === "23505" ? "A portfolio with this name already exists." : `Portfolio could not be created: ${error.message}` } : saved("Portfolio created. Assign an HOD when ready; no HOD authority is granted yet.");
}
const appointPortfolioSchema = z.object({ schoolId: z.string().uuid(), portfolioId: z.string().uuid(), assignmentId: z.string().uuid(), effectiveFrom: z.string().date() });
export async function appointHodPortfolio(_previous: HodScopeActionState, form: FormData): Promise<HodScopeActionState> {
  const parsed = appointPortfolioSchema.safeParse({ schoolId: form.get("schoolId"), portfolioId: form.get("portfolioId"), assignmentId: form.get("assignmentId"), effectiveFrom: form.get("effectiveFrom") });
  if (!parsed.success) return { message: "Choose a portfolio, eligible HOD and effective date." };
  if (!(await canConfigureSchool(parsed.data.schoolId))) return { message: "Only current school leadership can appoint HODs." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("appoint_hod_portfolio", { p_portfolio_id: parsed.data.portfolioId, p_assignment_id: parsed.data.assignmentId, p_effective_from: parsed.data.effectiveFrom });
  return error ? { message: error.code === "42501" ? "You cannot appoint an HOD for this school." : `Appointment could not be saved: ${error.message}` } : saved("HOD appointed with effective-dated responsibility history.");
}
