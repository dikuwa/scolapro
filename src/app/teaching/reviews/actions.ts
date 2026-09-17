"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth/get-user-context";
import { reviewPreparationSubmission } from "@/features/academics/server/hod-review";

const REVIEW_ROLES = new Set(["school_admin", "principal", "deputy_principal", "hod"]);

async function requireReviewer() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/reviews");
  if (context.platformMemberships.length) throw new Error("Platform users cannot perform school teaching reviews.");

  const membership = context.currentSchoolMembership;
  if (!membership || !REVIEW_ROLES.has(membership.roleKey)) {
    throw new Error("You are not authorized to review teaching preparations.");
  }
  return membership;
}

function requiredSubmissionId(formData: FormData) {
  const value = formData.get("submissionId");
  if (typeof value !== "string" || !value.trim()) throw new Error("Submission id is required.");
  return value.trim();
}

function optionalComment(formData: FormData) {
  const value = formData.get("comment");
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function reviewSubmissionAction(formData: FormData) {
  await requireReviewer();
  const submissionId = requiredSubmissionId(formData);
  await reviewPreparationSubmission(submissionId, "reviewed", optionalComment(formData));
  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/${submissionId}`);
  redirect(`/teaching/reviews/${submissionId}`);
}

export async function returnSubmissionAction(formData: FormData) {
  await requireReviewer();
  const submissionId = requiredSubmissionId(formData);
  const comment = optionalComment(formData);
  if (!comment) throw new Error("Feedback is required when returning a preparation for revision.");
  await reviewPreparationSubmission(submissionId, "returned", comment);
  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/${submissionId}`);
  redirect(`/teaching/reviews/${submissionId}`);
}
