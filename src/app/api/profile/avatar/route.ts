import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 3 * 1024 * 1024;

function avatarExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Sign in again before changing your avatar." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "The selected image could not be read." }, { status: 400 });
  }

  const avatar = formData.get("avatar");
  if (!(avatar instanceof File)) {
    return NextResponse.json({ message: "Choose a JPG, PNG or WebP image." }, { status: 400 });
  }
  if (!allowedAvatarTypes.has(avatar.type)) {
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
    return NextResponse.json({ message: "Your profile could not be loaded." }, { status: 500 });
  }

  const path = `${user.id}/avatar-${Date.now()}-${crypto.randomUUID()}.${avatarExtension(avatar.type)}`;
  const bytes = new Uint8Array(await avatar.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, bytes, {
    contentType: avatar.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    console.error("Avatar storage upload failed", {
      userId: user.id,
      statusCode: uploadError.statusCode,
      error: uploadError.message,
    });
    return NextResponse.json({ message: "The avatar could not be uploaded. Please try again." }, { status: 502 });
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("avatar_path")
    .maybeSingle();

  if (updateError || !updatedProfile) {
    await supabase.storage.from("avatars").remove([path]);
    console.error("Avatar profile finalization failed", {
      userId: user.id,
      error: updateError?.message ?? "profile row not found",
    });
    return NextResponse.json({ message: "The avatar could not be saved to your profile." }, { status: 500 });
  }

  if (profile?.avatar_path && profile.avatar_path !== path) {
    const { error: cleanupError } = await supabase.storage.from("avatars").remove([profile.avatar_path]);
    if (cleanupError) {
      console.warn("Previous avatar cleanup failed", { userId: user.id, error: cleanupError.message });
    }
  }

  const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  return NextResponse.json({
    message: "Profile photo updated.",
    avatarUrl: `${publicUrl}?v=${Date.now()}`,
  });
}
