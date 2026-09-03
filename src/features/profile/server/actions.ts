"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileActionState = { success?: boolean; message?: string };

const avatarPathPattern = /^([0-9a-f-]{36})\/avatar-[0-9]+-[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export async function saveUploadedAvatar(path: string): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again before changing your avatar." };

  const match = avatarPathPattern.exec(path);
  if (!match || match[1] !== user.id) return { success: false, message: "The uploaded avatar path is invalid." };

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) return { success: false, message: "Your profile could not be loaded." };

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (updateError) return { success: false, message: "The avatar could not be saved to your profile." };

  if (profile?.avatar_path && profile.avatar_path !== path) {
    await supabase.storage.from("avatars").remove([profile.avatar_path]);
  }

  revalidatePath("/", "layout");
  return { success: true, message: "Profile photo updated." };
}

export async function deleteAvatar(): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again before changing your avatar." };

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) return { success: false, message: "Your profile could not be loaded." };

  if (profile?.avatar_path) {
    const { error: removeError } = await supabase.storage.from("avatars").remove([profile.avatar_path]);
    if (removeError) return { success: false, message: "The profile photo could not be removed from storage." };
  }

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_path: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (updateError) return { success: false, message: "The profile photo could not be cleared from your account." };

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
