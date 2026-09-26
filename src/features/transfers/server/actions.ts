"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { getLearnerTransferFormWorkspace } from "@/features/transfers/server/transfer-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TransferFormActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  snapshotId?: string;
};

const draftSchema = z.object({
  transferEventId: z.string().uuid(),
  reasonForDeparture: z.string().trim().min(1, "Reason for departure is required.").max(4000),
  mediumOfInstruction: z.string().trim().max(500).optional(),
  documentsAttached: z.string().trim().max(4000).optional(),
  behaviourSummary: z.string().trim().max(4000).optional(),
  healthSummary: z.string().trim().max(4000).optional(),
  otherRelevantInformation: z.string().trim().max(4000).optional(),
  verificationNote: z.string().trim().max(2000).optional(),
});

export async function saveLearnerTransferFormDraft(
  _state: TransferFormActionState,
  formData: FormData,
): Promise<TransferFormActionState> {
  const parsed = draftSchema.safeParse({
    transferEventId: String(formData.get("transferEventId") ?? ""),
    reasonForDeparture: String(formData.get("reasonForDeparture") ?? ""),
    mediumOfInstruction: String(formData.get("mediumOfInstruction") ?? ""),
    documentsAttached: String(formData.get("documentsAttached") ?? ""),
    behaviourSummary: String(formData.get("behaviourSummary") ?? ""),
    healthSummary: String(formData.get("healthSummary") ?? ""),
    otherRelevantInformation: String(formData.get("otherRelevantInformation") ?? ""),
    verificationNote: String(formData.get("verificationNote") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, message: "Review the highlighted transfer-form fields." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_learner_transfer_form_draft", {
    p_transfer_event_id: parsed.data.transferEventId,
    p_reason_for_departure: parsed.data.reasonForDeparture,
    p_documents_attached: parsed.data.documentsAttached || null,
    p_behaviour_summary: parsed.data.behaviourSummary || null,
    p_health_summary: parsed.data.healthSummary || null,
    p_other_relevant_information: parsed.data.otherRelevantInformation || null,
    p_verification_note: parsed.data.verificationNote || null,
    p_medium_of_instruction: parsed.data.mediumOfInstruction || null,
  });

  if (error) {
    return {
      message: /permission|authorized/i.test(error.message)
        ? "You do not have current source-school authority to edit this transfer form."
        : "The learner transfer-form draft could not be saved.",
    };
  }

  revalidatePath(`/school/crc-custody/transfer-form/${parsed.data.transferEventId}`);
  revalidatePath("/school/crc-custody");
  return { success: true, message: "Transfer-form draft saved." };
}

const finalizeSchema = z.object({
  transferEventId: z.string().uuid(),
});

export async function finalizeLearnerTransferForm(
  _state: TransferFormActionState,
  formData: FormData,
): Promise<TransferFormActionState> {
  const parsed = finalizeSchema.safeParse({
    transferEventId: String(formData.get("transferEventId") ?? ""),
  });
  if (!parsed.success) return { message: "Invalid transfer-form record." };

  try {
    const workspace = await getLearnerTransferFormWorkspace(parsed.data.transferEventId);
    if (!workspace.draft?.reasonForDeparture.trim()) {
      return { message: "Save and verify the reason for departure before finalizing." };
    }
    if (!workspace.draft.verificationNote.trim()) {
      return { message: "Add a verification note before finalizing." };
    }

    const profile = await getLiveSchoolDocumentProfile(workspace.source.school.schoolId);
    const headerSnapshot = {
      schoolName: profile.schoolName,
      schoolEmisNumber: profile.schoolEmisNumber,
      formerName: profile.formerName,
      logoUrl: profile.logoUrl,
      logoStoragePath: profile.logoStoragePath,
      physicalAddress: profile.physicalAddress,
      telephone: profile.telephone,
      fax: profile.fax,
      email: profile.email,
      postalAddress: profile.postalAddress,
      town: profile.town,
      schoolNameFont: profile.schoolNameFont,
    };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("finalize_learner_transfer_form", {
      p_transfer_event_id: parsed.data.transferEventId,
      p_header_snapshot: headerSnapshot,
    });

    if (error) {
      return {
        message: /leadership/i.test(error.message)
          ? "Only current source-school leadership may finalize the official transfer form."
          : error.message.includes("Verification note")
            ? "A verification note is required before finalization."
            : "The learner transfer form could not be finalized.",
      };
    }

    const row = (Array.isArray(data) ? data[0] : data) as { snapshot_id?: string } | undefined;
    revalidatePath(`/school/crc-custody/transfer-form/${parsed.data.transferEventId}`);
    revalidatePath("/school/crc-custody");
    return {
      success: true,
      message: "Official learner transfer form finalized.",
      snapshotId: row?.snapshot_id,
    };
  } catch {
    return { message: "The learner transfer form could not be finalized." };
  }
}
