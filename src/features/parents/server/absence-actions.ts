"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AbsenceActionState = { success?: boolean; warning?: boolean; message?: string };

const reasonCategories = ["illness", "medical_appointment", "compassionate", "family", "transport", "weather", "school_activity", "other"] as const;
const allowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxAttachmentBytes = 10 * 1024 * 1024;

const submitAbsenceSchema = z.object({
  learnerId: z.string().uuid(),
  absenceFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  absenceTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reasonCategory: z.enum(reasonCategories),
  message: z.string().max(2000).optional(),
});

function safeFileName(name: string) {
  const normalized = name.trim().replace(/[^A-Za-z0-9._-]+/g, "_");
  return normalized || "attachment";
}

export async function submitAbsenceNotice(_state: AbsenceActionState, formData: FormData): Promise<AbsenceActionState> {
  const parsed = submitAbsenceSchema.safeParse({
    learnerId: formData.get("learnerId"),
    absenceFrom: formData.get("absenceFrom"),
    absenceTo: formData.get("absenceTo"),
    reasonCategory: formData.get("reasonCategory"),
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) return { message: "Please fill in all required fields correctly." };

  const fileEntry = formData.get("file");
  const file = typeof fileEntry === "string" || !fileEntry || fileEntry.size === 0 ? null : fileEntry;

  if (file) {
    if (!allowedAttachmentTypes.has(file.type)) return { message: "Supporting document must be JPG, PNG, WebP or PDF." };
    if (file.size > maxAttachmentBytes) return { message: "Supporting document must be 10 MB or smaller." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: noticeId, error } = await supabase.rpc("submit_guardian_absence_notice", {
    p_learner_id: parsed.data.learnerId,
    p_absence_from: parsed.data.absenceFrom,
    p_absence_to: parsed.data.absenceTo,
    p_reason_category: parsed.data.reasonCategory,
    p_message: parsed.data.message || null,
  });

  if (error || typeof noticeId !== "string") return { message: error?.message || "Could not submit absence notice." };

  if (file) {
    const [{ data: authData, error: authError }, { data: notice, error: noticeError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("guardian_absence_notices").select("school_id").eq("id", noticeId).single(),
    ]);

    if (authError || !authData.user || noticeError || !notice?.school_id) {
      revalidatePath("/parent");
      return { success: true, warning: true, message: "Absence notice was submitted, but the supporting document could not be prepared for upload." };
    }

    const path = `${notice.school_id}/${authData.user.id}/${noticeId}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("guardian-absence-evidence").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      revalidatePath("/parent");
      return { success: true, warning: true, message: `Absence notice was submitted, but the supporting document could not be uploaded: ${uploadError.message}` };
    }

    const { error: registerError } = await supabase.rpc("register_guardian_absence_attachment", {
      p_notice_id: noticeId,
      p_storage_path: path,
      p_file_name: file.name,
      p_mime_type: file.type,
      p_file_size_bytes: file.size,
    });

    if (registerError) {
      await supabase.storage.from("guardian-absence-evidence").remove([path]);
      revalidatePath("/parent");
      return { success: true, warning: true, message: `Absence notice was submitted, but the supporting document could not be registered: ${registerError.message}` };
    }
  }

  revalidatePath("/parent");
  return { success: true, message: file ? "Absence notice and supporting document submitted. The school will review them." : "Absence notice submitted. The school will review it." };
}

const reviewAbsenceSchema = z.object({
  noticeId: z.string().uuid(),
  status: z.enum(["accepted", "returned", "closed"]),
  reviewNote: z.string().max(2000).optional(),
});

export async function reviewAbsenceNotice(_state: AbsenceActionState, formData: FormData): Promise<AbsenceActionState> {
  const parsed = reviewAbsenceSchema.safeParse({
    noticeId: formData.get("noticeId"),
    status: formData.get("status"),
    reviewNote: formData.get("reviewNote") || undefined,
  });

  if (!parsed.success) return { message: "Invalid review data." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_guardian_absence_notice", {
    p_notice_id: parsed.data.noticeId,
    p_status: parsed.data.status,
    p_review_note: parsed.data.reviewNote || null,
  });

  if (error) return { message: error.message || "Could not review absence notice." };

  revalidatePath("/school/absence-reviews");
  return { success: true, message: `Notice ${parsed.data.status}.` };
}

const reasonLabels: Record<string, string> = {
  illness: "Illness",
  medical_appointment: "Medical appointment",
  compassionate: "Compassionate",
  family: "Family",
  transport: "Transport",
  weather: "Weather",
  school_activity: "School activity",
  other: "Other",
};

export { reasonLabels };
