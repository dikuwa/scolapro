"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CrcContributionActionState = {
  success?: boolean;
  message?: string;
};

const contributionSchema = z.object({
  enrolmentId: z.string().uuid(),
  learnerId: z.string().uuid(),
  domain: z.enum(["psychological", "social", "overall_impression"]),
  observation: z.string().trim().min(3).max(4000),
  generalRemark: z.string().trim().max(4000).optional(),
});

export async function appendRoutineCrcContribution(
  _state: CrcContributionActionState,
  formData: FormData,
): Promise<CrcContributionActionState> {
  const parsed = contributionSchema.safeParse({
    enrolmentId: String(formData.get("enrolmentId") ?? ""),
    learnerId: String(formData.get("learnerId") ?? ""),
    domain: String(formData.get("domain") ?? ""),
    observation: String(formData.get("observation") ?? ""),
    generalRemark: String(formData.get("generalRemark") ?? ""),
  });

  if (!parsed.success) {
    return { message: "Choose a routine CRC area and enter a clear observation." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("append_crc_routine_contribution", {
    p_enrolment_id: parsed.data.enrolmentId,
    p_domain: parsed.data.domain,
    p_observation: parsed.data.observation,
    p_general_remark: parsed.data.generalRemark || null,
  });

  if (error) {
    return {
      message: error.message.includes("register-teacher")
        ? "Only the current register teacher for this learner may add routine CRC contributions."
        : "The routine CRC contribution could not be saved.",
    };
  }

  revalidatePath(`/learners/${parsed.data.learnerId}/cumulative-record`);
  revalidatePath("/school/crc-custody");
  return { success: true, message: "Routine CRC contribution saved." };
}
