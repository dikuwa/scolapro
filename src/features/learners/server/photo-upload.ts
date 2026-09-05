"use server";

import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ticketSchema = z.object({
  learnerId: z.string().uuid(),
  schoolId: z.string().uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export type LearnerPhotoUploadTicket = {
  success: boolean;
  message?: string;
  path?: string;
  token?: string;
};

function photoExtension(contentType: "image/jpeg" | "image/png" | "image/webp") {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}

export async function prepareLearnerPhotoUpload(
  learnerId: string,
  schoolId: string,
  contentType: string,
): Promise<LearnerPhotoUploadTicket> {
  const parsed = ticketSchema.safeParse({ learnerId, schoolId, contentType });
  if (!parsed.success) return { success: false, message: "Choose a supported learner photo." };

  const context = await getUserContext();
  const membership = context.memberships.find(
    (item) => item.schoolId === parsed.data.schoolId && item.roleKey === "school_admin",
  );
  if (!context.user || !membership) {
    return { success: false, message: "Only the School Admin can update learner photos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: identifier, error: identifierError } = await supabase
    .from("school_learner_identifiers")
    .select("learner_id")
    .eq("school_id", parsed.data.schoolId)
    .eq("learner_id", parsed.data.learnerId)
    .maybeSingle();

  if (identifierError || !identifier) {
    return { success: false, message: "The learner does not belong to this school." };
  }

  const path = `${parsed.data.schoolId}/${parsed.data.learnerId}/${crypto.randomUUID()}.${photoExtension(parsed.data.contentType)}`;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from("learner-photos").createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error("Unable to create learner photo signed upload", {
        learnerId: parsed.data.learnerId,
        schoolId: parsed.data.schoolId,
        error: error?.message,
      });
      return { success: false, message: "The learner photo upload service is unavailable. Try again." };
    }

    return { success: true, path, token: data.token };
  } catch (error) {
    console.error("Learner photo upload ticket failed", error);
    return { success: false, message: "The learner photo upload service is not configured correctly." };
  }
}
