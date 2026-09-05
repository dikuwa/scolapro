"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CrcCustodyActionState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
};

const custodyActionSchema = z.object({
  custodyId: z.string().uuid("Invalid custody record."),
  action: z.enum(["authorize", "dispatch", "receive", "acknowledge", "close"]),
});

const transitionRpc: Record<string, string> = {
  authorize: "authorize_crc_custody",
  dispatch: "dispatch_crc_custody",
  receive: "receive_crc_custody",
  acknowledge: "acknowledge_crc_custody",
  close: "close_crc_custody",
};

export async function transitionCrcCustody(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = custodyActionSchema.safeParse({
    custodyId: formData.get("custodyId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(transitionRpc[parsed.data.action], {
    p_custody_id: parsed.data.custodyId,
  });

  if (error) {
    return { message: "The custody record could not be updated. Review the required scope and try again." };
  }

  revalidatePath("/school/crc-custody");
  return { success: true, message: "CRC custody updated." };
}

const prepareSchema = z.object({
  learnerId: z.string().uuid("Choose a learner."),
  receivingSchoolId: z.string().uuid("Choose a receiving school."),
  receivingUserId: z.string().uuid("Choose a receiving custodian."),
  custodyNote: z.string().trim().max(2000, "Keep the note under 2000 characters.").optional(),
});

export async function prepareCrcCustody(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = prepareSchema.safeParse({
    learnerId: formData.get("learnerId"),
    receivingSchoolId: formData.get("receivingSchoolId"),
    receivingUserId: formData.get("receivingUserId"),
    custodyNote: formData.get("custodyNote"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("prepare_crc_custody", {
    p_learner_id: parsed.data.learnerId,
    p_receiving_school_id: parsed.data.receivingSchoolId,
    p_receiving_user_id: parsed.data.receivingUserId,
    p_custody_note: parsed.data.custodyNote || null,
  });

  if (error) {
    return { message: "The custody record could not be prepared. Confirm the learner enrolment and receiving custodian scope." };
  }

  revalidatePath("/school/crc-custody");
  return { success: true, message: "CRC custody prepared. School leadership must authorize it before dispatch." };
}