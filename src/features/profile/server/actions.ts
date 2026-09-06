"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileActionState = { success?: boolean; message?: string };

const avatarPathPattern = /^([0-9a-f-]{36})\/avatar-[0-9]+-[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export async function saveUploadedAvatar(path: string): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError) console.error("Avatar save authorization failed", { error: userError.message });
    return { success: false, message: "Sign in again before changing your avatar." };
  }

  const match = avatarPathPattern.exec(path);
  if (!match || match[1] !== user.id) {
    console.error("Avatar save rejected invalid path", { userId: user.id, path });
    return { success: false, message: "The uploaded avatar path is invalid." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Avatar profile lookup failed", { userId: user.id, error: profileError.message, code: profileError.code });
    return { success: false, message: "Your profile could not be loaded." };
  }

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (updateError) {
    console.error("Avatar profile link failed", { userId: user.id, path, error: updateError.message, code: updateError.code });
    return { success: false, message: "The photo was uploaded, but it could not be linked to your profile." };
  }

  if (profile?.avatar_path && profile.avatar_path !== path) {
    const { error: cleanupError } = await supabase.storage.from("avatars").remove([profile.avatar_path]);
    if (cleanupError) console.warn("Previous avatar cleanup failed", { userId: user.id, path: profile.avatar_path, error: cleanupError.message });
  }

  revalidatePath("/", "layout");
  return { success: true, message: "Profile photo updated." };
}

export async function deleteAvatar(): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError) console.error("Avatar delete authorization failed", { error: userError.message });
    return { success: false, message: "Sign in again before changing your avatar." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Avatar delete profile lookup failed", { userId: user.id, error: profileError.message, code: profileError.code });
    return { success: false, message: "Your profile could not be loaded." };
  }

  if (profile?.avatar_path) {
    const { error: removeError } = await supabase.storage.from("avatars").remove([profile.avatar_path]);
    if (removeError) {
      console.error("Avatar storage delete failed", { userId: user.id, path: profile.avatar_path, error: removeError.message });
      return { success: false, message: `The profile photo could not be removed from storage: ${removeError.message}` };
    }
  }

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_path: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (updateError) {
    console.error("Avatar profile clear failed", { userId: user.id, error: updateError.message, code: updateError.code });
    return { success: false, message: "The profile photo was removed from storage, but your account could not be updated." };
  }

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
