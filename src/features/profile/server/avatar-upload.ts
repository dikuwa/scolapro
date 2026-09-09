"use server";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const avatarContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
type AvatarContentType = z.infer<typeof avatarContentTypeSchema>;

export type AvatarUploadTicket = {
  success: boolean;
  message?: string;
  path?: string;
  token?: string;
  contentType?: AvatarContentType;
};

function normalizeAvatarContentType(contentType: string): AvatarContentType | null {
  const normalized = contentType.trim().toLowerCase();
  const canonical = normalized === "image/jpg" ? "image/jpeg" : normalized;
  const parsed = avatarContentTypeSchema.safeParse(canonical);
  return parsed.success ? parsed.data : null;
}

function avatarExtension(contentType: AvatarContentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function signedUploadPreparationMessage(error: unknown) {
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error
    ? Number(error.statusCode)
    : undefined;
  const detail = error instanceof Error
    ? error.message.toLowerCase()
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";

  if (statusCode === 401 || statusCode === 403 || detail.includes("unauthorized") || detail.includes("forbidden")) {
    return "The photo upload service could not authorize this upload. Sign in again and retry.";
  }
  if ((statusCode !== undefined && statusCode >= 500) || detail.includes("timeout") || detail.includes("network") || detail.includes("fetch")) {
    return "The photo upload service is temporarily unavailable. Try again.";
  }
  return "The photo upload service could not prepare this upload. Try again.";
}

export async function prepareAvatarUpload(contentType: string): Promise<AvatarUploadTicket> {
  const canonicalContentType = normalizeAvatarContentType(contentType);
  if (!canonicalContentType) return { success: false, message: "Choose a JPG, PNG or WebP image." };

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError) console.error("Avatar upload authorization failed", { error: userError.message });
    return { success: false, message: "Your session could not be verified. Sign in again and retry." };
  }

  const path = `${user.id}/avatar-${Date.now()}-${crypto.randomUUID()}.${avatarExtension(canonicalContentType)}`;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from("avatars").createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error("Unable to create avatar signed upload", {
        userId: user.id,
        error: error?.message,
      });
      return { success: false, message: signedUploadPreparationMessage(error) };
    }

    return { success: true, path, token: data.token, contentType: canonicalContentType };
  } catch (error) {
    console.error("Avatar signed upload ticket failed", { userId: user.id, error });
    return { success: false, message: signedUploadPreparationMessage(error) };
  }
}
