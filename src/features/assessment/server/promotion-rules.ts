"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const conditionTypes = ["minimum_subject_result", "minimum_passed_subjects", "maximum_failed_subjects", "minimum_overall_average", "minimum_attendance_rate", "manual_review_required"] as const;
const ruleSchema = z.object({
  schoolId: z.string().uuid(), academicYear: z.coerce.number().int().min(2000).max(2200), gradeId: z.string().uuid(),
  ruleSetKey: z.string().trim().min(1), version: z.string().trim().min(1), resultTermNumber: z.coerce.number().int().min(1).max(6),
  passOutcome: z.enum(["promoted", "condoned", "completed", "pending"]), failOutcome: z.enum(["not_promoted", "pending"]),
  sourceReference: z.string().trim().max(500).optional(), effectiveFrom: z.string().date(), effectiveTo: z.string().date().optional().or(z.literal("")),
  conditionCode: z.string().trim().min(1), conditionType: z.enum(conditionTypes), subjectCode: z.string().trim().optional(), threshold: z.string().trim().optional(),
});

export type PromotionRuleActionState = { message?: string; success?: boolean; fieldErrors?: Record<string, string[]> };

export async function listPromotionRuleVersions(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("promotion_rule_sets").select("id,grade_id,rule_set_key,version,status,source_reference").eq("school_id", schoolId).eq("academic_year", academicYear).order("grade_id").order("version");
  if (error) throw new Error("Unable to load promotion rule versions.");
  return (data ?? []).map((row) => ({ id: row.id, gradeId: row.grade_id, key: row.rule_set_key, version: row.version, status: row.status, sourceReference: row.source_reference }));
}

export async function createPromotionRuleVersion(_previous: PromotionRuleActionState, formData: FormData): Promise<PromotionRuleActionState> {
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const threshold = parsed.data.threshold ? Number(parsed.data.threshold) : null;
  if (parsed.data.threshold && !Number.isFinite(threshold)) return { message: "Enter a numeric condition threshold or leave it blank for a rule that does not use one." };
  const supabase = await createSupabaseServerClient();
  const created = await supabase.rpc("create_promotion_rule_set_version", {
    p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_grade_id: parsed.data.gradeId,
    p_rule_set_key: parsed.data.ruleSetKey, p_version: parsed.data.version, p_result_term_number: parsed.data.resultTermNumber,
    p_pass_outcome: parsed.data.passOutcome, p_fail_outcome: parsed.data.failOutcome, p_source_reference: parsed.data.sourceReference || null,
    p_effective_from: parsed.data.effectiveFrom, p_effective_to: parsed.data.effectiveTo || null,
  });
  if (created.error || !created.data) return { message: created.error?.message ?? "The promotion rule version could not be created." };
  const condition = await supabase.rpc("add_promotion_rule_condition", {
    p_promotion_rule_set_id: created.data, p_condition_code: parsed.data.conditionCode, p_condition_type: parsed.data.conditionType,
    p_subject_code: parsed.data.subjectCode || null, p_threshold: threshold, p_required: true, p_configuration: {}, p_sort_order: 100,
  });
  if (condition.error) return { message: "The draft rule was created, but its condition could not be saved. Review the draft before activating it." };
  revalidatePath("/school/setup"); revalidatePath("/school/progression");
  return { success: true, message: "Draft promotion rule version and condition saved." };
}

export async function activatePromotionRuleVersion(formData: FormData): Promise<PromotionRuleActionState> {
  const ruleSetId = String(formData.get("ruleSetId") ?? "");
  if (!z.string().uuid().safeParse(ruleSetId).success) return { message: "This promotion rule version could not be identified." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("activate_promotion_rule_set", { p_rule_set_id: ruleSetId });
  if (error) return { message: error.message };
  revalidatePath("/school/setup"); revalidatePath("/school/progression");
  return { success: true, message: "Promotion rule version activated." };
}
