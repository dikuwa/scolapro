"use server";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const avatarTicketSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export type AvatarUploadTicket = {
  success: boolean;
  message?: string;
  path?: string;
  token?: string;
};

function avatarExtension(contentType: "image/jpeg" | "image/png" | "image/webp") {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function prepareAvatarUpload(contentType: string): Promise<AvatarUploadTicket> {
  const parsed = avatarTicketSchema.safeParse({ contentType });
  if (!parsed.success) return { success: false, message: "Choose a JPG, PNG or WebP image." };

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError) console.error("Avatar upload authorization failed", { error: userError.message });
    return { success: false, message: "Your session could not be verified. Sign in again and retry." };
  }

  const path = `${user.id}/avatar-${Date.now()}-${crypto.randomUUID()}.${avatarExtension(parsed.data.contentType)}`;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from("avatars").createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error("Unable to create avatar signed upload", {
        userId: user.id,
        error: error?.message,
      });
      return { success: false, message: "The photo upload service could not prepare this upload. Try again." };
    }

    return { success: true, path, token: data.token };
  } catch (error) {
    console.error("Avatar signed upload ticket failed", { userId: user.id, error });
    return { success: false, message: "The photo upload service is not configured correctly." };
  }
}
