"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ParentPortalActionState = { success?: boolean; message?: string };

const claimSchema = z.object({ guardianId: z.string().uuid() });

export async function claimGuardianProfile(_state: ParentPortalActionState, formData: FormData): Promise<ParentPortalActionState> {
  const parsed = claimSchema.safeParse({ guardianId: formData.get("guardianId") });
  if (!parsed.success) return { message: "The guardian profile could not be identified." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("claim_guardian_profile", { p_guardian_id: parsed.data.guardianId });
  if (error) {
    if (error.message.toLowerCase().includes("email")) {
      return { message: "Your signed-in email does not match an active guardian email contact." };
    }
    return { message: "The guardian profile could not be linked to this account." };
  }

  revalidatePath("/parent");
  return { success: true, message: "Guardian profile linked. Your children are now available." };
}

export async function submitAbsenceNotice(_state: ParentPortalActionState, formData: FormData): Promise<ParentPortalActionState> {
  const parsed = z.object({ learnerId: z.string().uuid(), absenceFrom: z.iso.date(), absenceTo: z.iso.date(), reason: z.enum(["illness","medical_appointment","compassionate","family","transport","weather","school_activity","other"]), message: z.string().trim().max(1000).optional() }).safeParse({
    learnerId: formData.get("learnerId"), absenceFrom: formData.get("absenceFrom"), absenceTo: formData.get("absenceTo"), reason: formData.get("reason"), message: String(formData.get("message") ?? ""),
  });
  if (!parsed.success) return { message: "Check the learner, dates and absence reason." };
  if (parsed.data.absenceTo < parsed.data.absenceFrom) return { message: "The end date cannot be before the start date." };
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size <= 0) return { message: "Choose a supporting JPG, PNG, WebP or PDF document." };
  const allowed = new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
  if (!allowed.has(file.type) || file.size > 10_485_760) return { message: "Supporting documents must be JPG, PNG, WebP or PDF and no larger than 10 MB." };
  const context = await getUserContext();
  if (!context.user) return { message: "Sign in again before submitting this notice." };
  const supabase = await createSupabaseServerClient();
  const { data: noticeId, error: noticeError } = await supabase.rpc("submit_guardian_absence_notice", { p_learner_id: parsed.data.learnerId, p_absence_from: parsed.data.absenceFrom, p_absence_to: parsed.data.absenceTo, p_reason_category: parsed.data.reason, p_message: parsed.data.message || null });
  if (noticeError || !noticeId) return { message: noticeError?.message ?? "The absence notice could not be submitted." };
  const child = context.guardianLinks.length ? await supabase.from("guardian_absence_notices").select("tenant_id,school_id").eq("id", noticeId).single() : null;
  if (!child?.data) return { message: "The notice was saved, but the secure document could not be attached." };
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  const storagePath = `${child.data.tenant_id}/${child.data.school_id}/${noticeId}/${context.user.id}/${randomUUID()}.${extension || "bin"}`;
  const admin = createSupabaseAdminClient();
  const { error: uploadError } = await admin.storage.from("guardian-absence-evidence").upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (uploadError) return { message: "The notice was saved, but the supporting document upload failed. Please contact the school." };
  const { error: metadataError } = await supabase.rpc("register_guardian_absence_attachment", { p_notice_id: noticeId, p_storage_path: storagePath, p_file_name: file.name, p_mime_type: file.type, p_file_size_bytes: file.size });
  if (metadataError) {
    await admin.storage.from("guardian-absence-evidence").remove([storagePath]);
    return { message: "The notice was saved, but the supporting document could not be registered." };
  }
  revalidatePath("/parent");
  revalidatePath("/attendance/absence-notices");
  return { success: true, message: "Absence notice and supporting document submitted for school review." };
}
