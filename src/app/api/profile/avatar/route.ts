import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 3 * 1024 * 1024;

function normalizeAvatarContentType(contentType: string) {
  const normalized = contentType.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function avatarExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function storageUploadMessage(error: { message?: string; statusCode?: string | number }) {
  const statusCode = Number(error.statusCode);
  const detail = error.message?.toLowerCase() ?? "";

  if (statusCode === 401 || statusCode === 403 || detail.includes("unauthorized") || detail.includes("forbidden")) {
    return "The avatar upload was not authorized. Sign in again and retry.";
  }
  if (statusCode === 413 || detail.includes("payload") || detail.includes("too large") || detail.includes("size limit")) {
    return "Avatar images must be 3 MB or smaller.";
  }
  if (statusCode === 415 || detail.includes("mime") || detail.includes("content type") || detail.includes("media type")) {
    return "Storage rejected this image type. Use JPG, PNG or WebP.";
  }
  if (statusCode >= 500 || detail.includes("timeout") || detail.includes("network")) {
    return "The photo upload service is temporarily unavailable. Try again.";
  }
  return "Storage rejected the avatar upload. Check the selected image and try again.";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError) console.error("Avatar API authorization failed", { error: userError.message });
    return NextResponse.json({ message: "Sign in again before changing your avatar." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Avatar request body could not be read", { userId: user.id, error });
    return NextResponse.json({ message: "The selected image could not be read. Choose it again and retry." }, { status: 400 });
  }

  const avatar = formData.get("avatar");
  if (!(avatar instanceof File)) {
    return NextResponse.json({ message: "Choose a JPG, PNG or WebP image." }, { status: 400 });
  }
  const contentType = normalizeAvatarContentType(avatar.type);
  if (!allowedAvatarTypes.has(contentType)) {
    return NextResponse.json({ message: "Use a JPG, PNG or WebP image." }, { status: 415 });
  }
  if (avatar.size <= 0 || avatar.size > maxAvatarBytes) {
    return NextResponse.json({ message: "Avatar images must be 3 MB or smaller." }, { status: 413 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Avatar profile lookup failed", {
      userId: user.id,
      code: profileError.code,
      error: profileError.message,
    });
    return NextResponse.json({ message: "Your profile could not be loaded. Try again." }, { status: 500 });
  }

  const path = `${user.id}/avatar-${Date.now()}-${crypto.randomUUID()}.${avatarExtension(contentType)}`;
  const bytes = new Uint8Array(await avatar.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    console.error("Avatar storage upload failed", {
      userId: user.id,
      statusCode: uploadError.statusCode,
      error: uploadError.message,
    });
    return NextResponse.json({ message: storageUploadMessage(uploadError) }, { status: 502 });
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("avatar_path")
    .maybeSingle();

  if (updateError || !updatedProfile) {
    const { error: cleanupError } = await supabase.storage.from("avatars").remove([path]);
    if (cleanupError) {
      console.warn("Failed avatar cleanup after profile-save failure", {
        userId: user.id,
        path,
        error: cleanupError.message,
      });
    }
    console.error("Avatar profile finalization failed", {
      userId: user.id,
      path,
      code: updateError?.code,
      error: updateError?.message ?? "profile row not found",
    });
    return NextResponse.json({ message: "The photo was uploaded, but it could not be linked to your profile. Try again." }, { status: 500 });
  }

  if (profile?.avatar_path && profile.avatar_path !== path) {
    const { error: cleanupError } = await supabase.storage.from("avatars").remove([profile.avatar_path]);
    if (cleanupError) {
      console.warn("Previous avatar cleanup failed", {
        userId: user.id,
        path: profile.avatar_path,
        error: cleanupError.message,
      });
    }
  }

  const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  return NextResponse.json({
    message: "Profile photo updated.",
    avatarUrl: `${publicUrl}?v=${Date.now()}`,
  });
}
