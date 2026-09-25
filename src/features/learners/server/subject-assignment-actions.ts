"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canManageLearnerSubjects } from "@/features/learners/server/subject-assignments";
import type { SubjectAssignmentActionResult, SubjectAssignmentPreview } from "@/features/learners/subject-assignment-types";

const bulkSchema = z.object({
  academicYear: z.number().int().min(2000).max(2200),
  scopeType: z.enum(["grade", "register_class", "field_group"]),
  scopeId: z.string().uuid(),
  subjectOfferingIds: z.array(z.string().uuid()).max(50),
  previewFingerprint: z.string().min(1).optional(),
});

const individualSchema = z.object({
  learnerId: z.string().uuid(),
  enrolmentId: z.string().uuid(),
  subjectOfferingIds: z.array(z.string().uuid()).max(50),
});

async function managerContext() {
  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (!context.user || !membership || !canManageLearnerSubjects(membership)) throw new Error("You do not have authority to manage learner subjects.");
  return membership;
}

function safeMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/changed after preview/i.test(message)) return "The learner or subject state changed after preview. Generate a fresh preview before applying.";
  if (/outside the current school|Permission denied/i.test(message)) return "The selected scope is not available in your current school context.";
  if (/conflict/i.test(message)) return "Resolve the preview conflicts before applying.";
  return fallback;
}

export async function previewLearnerSubjectBulkAssignment(input: unknown): Promise<SubjectAssignmentActionResult> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Choose a valid scope and subject selection." };
  try {
    const membership = await managerContext();
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("preview_learner_subject_bulk_assignment", {
      p_school_id: membership.schoolId,
      p_academic_year: parsed.data.academicYear,
      p_scope_type: parsed.data.scopeType,
      p_scope_id: parsed.data.scopeId,
      p_subject_offering_ids: parsed.data.subjectOfferingIds,
    });
    if (error) throw new Error(error.message);
    return { success: true, message: "Preview ready. Review every change before applying.", preview: data as SubjectAssignmentPreview };
  } catch (error) {
    return { success: false, message: safeMessage(error, "The subject assignment preview could not be prepared.") };
  }
}

export async function applyLearnerSubjectBulkAssignment(input: unknown): Promise<SubjectAssignmentActionResult> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success || !parsed.data.previewFingerprint) return { success: false, message: "Generate a current preview before applying." };
  try {
    const membership = await managerContext();
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("apply_learner_subject_bulk_assignment", {
      p_school_id: membership.schoolId,
      p_academic_year: parsed.data.academicYear,
      p_scope_type: parsed.data.scopeType,
      p_scope_id: parsed.data.scopeId,
      p_subject_offering_ids: parsed.data.subjectOfferingIds,
      p_preview_fingerprint: parsed.data.previewFingerprint,
      p_reason: "Bulk subject assignment from governed workspace",
    });
    if (error) throw new Error(error.message);
    revalidatePath("/school/learner-subjects");
    revalidatePath("/learners");
    return { success: true, message: "Subject assignments applied. Historical registrations were preserved.", preview: data as SubjectAssignmentPreview };
  } catch (error) {
    return { success: false, message: safeMessage(error, "Subject assignments could not be applied.") };
  }
}

export async function syncIndividualLearnerSubjects(input: unknown): Promise<SubjectAssignmentActionResult> {
  const parsed = individualSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Choose a valid subject selection." };
  try {
    await managerContext();
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("sync_learner_subject_registrations", {
      p_enrolment_id: parsed.data.enrolmentId,
      p_subject_offering_ids: parsed.data.subjectOfferingIds,
      p_source: "individual_subject_workspace",
      p_withdrawal_reason: "Individual learner subject selection updated",
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/learners/${parsed.data.learnerId}`);
    revalidatePath(`/learners/${parsed.data.learnerId}/academic/subjects`);
    return { success: true, message: "Learner subjects updated. Withdrawn history remains available." };
  } catch (error) {
    return { success: false, message: safeMessage(error, "Learner subjects could not be updated.") };
  }
}
