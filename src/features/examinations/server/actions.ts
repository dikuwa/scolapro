"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CandidateNumberActionState = { success?: boolean; message?: string };

const schema = z.object({
  candidateId: z.string().uuid(),
  candidateNumber: z.string().trim().min(1).max(80),
  centreNumber: z.string().trim().max(80).optional(),
  source: z.enum(["dnea_official", "official_import", "official_correction"]),
  note: z.string().trim().max(500).optional(),
});

export async function assignCandidateNumber(_state: CandidateNumberActionState, formData: FormData): Promise<CandidateNumberActionState> {
  const parsed = schema.safeParse({
    candidateId: formData.get("candidateId"),
    candidateNumber: formData.get("candidateNumber"),
    centreNumber: formData.get("centreNumber") || undefined,
    source: formData.get("source"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { message: "Enter a valid official Candidate Number and source." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_examination_candidate_number", {
    p_candidate_id: parsed.data.candidateId,
    p_candidate_number: parsed.data.candidateNumber,
    p_centre_number: parsed.data.centreNumber ?? null,
    p_source: parsed.data.source,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    if (error.message.includes("already assigned")) return { message: "That Candidate Number is already assigned in this examination cycle." };
    if (error.message.includes("Permission denied")) return { message: "You do not have permission to assign Candidate Numbers." };
    return { message: "The Candidate Number could not be saved." };
  }
  revalidatePath("/statutory/examinations");
  return { success: true, message: "Official Candidate Number saved." };
}

