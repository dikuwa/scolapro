"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileActionState = { success?: boolean; message?: string };

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadAvatar(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again before changing your avatar." };

  const file = formData.get("avatar");
  if (!(file instanceof File) || !file.size) return { success: false, message: "Choose an image first." };
  if (!allowedTypes.has(file.type)) return { success: false, message: "Use a JPG, PNG or WebP image." };
  if (file.size > 3 * 1024 * 1024) return { success: false, message: "Avatar images must be 3 MB or smaller." };

  const { data: profile } = await supabase.from("user_profiles").select("avatar_path").eq("user_id", user.id).maybeSingle();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return { success: false, message: "The avatar could not be uploaded." };

  const { error: updateError } = await supabase.from("user_profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (updateError) {
    await supabase.storage.from("avatars").remove([path]);
    return { success: false, message: "The avatar could not be saved to your profile." };
  }

  if (profile?.avatar_path && profile.avatar_path !== path) await supabase.storage.from("avatars").remove([profile.avatar_path]);
  revalidatePath("/", "layout");
  return { success: true, message: "Profile photo updated." };
}

export async function deleteAvatar(): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again before changing your avatar." };

  const { data: profile } = await supabase.from("user_profiles").select("avatar_path").eq("user_id", user.id).maybeSingle();
  if (profile?.avatar_path) await supabase.storage.from("avatars").remove([profile.avatar_path]);
  await supabase.from("user_profiles").update({ avatar_path: null, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  revalidatePath("/", "layout");
  return { success: true, message: "Profile photo removed." };
}

export async function changePassword(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 8) return { success: false, message: "Use at least 8 characters for your new password." };
  if (password !== confirmation) return { success: false, message: "The password confirmation does not match." };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again before changing your password." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { success: false, message: "Your password could not be changed." };

  await supabase.from("user_profiles").update({ must_change_password: false, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  revalidatePath("/", "layout");
  return { success: true, message: "Password changed successfully." };
}
