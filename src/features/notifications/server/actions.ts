"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotificationActionResult = { success: boolean; message?: string };

export async function markNotificationRead(notificationId: string): Promise<NotificationActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again to update notifications." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id)
    .is("read_at", null);

  if (error) return { success: false, message: "The notification could not be marked as read." };
  revalidatePath("/", "layout");
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again to update notifications." };
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { success: false, message: "Notifications could not be marked as read." };
  revalidatePath("/", "layout");
  return { success: true };
}

export async function clearNotifications(): Promise<NotificationActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Sign in again to update notifications." };
  const { error } = await supabase.rpc("dismiss_all_notifications");
  if (error) return { success: false, message: "Notifications could not be cleared." };
  revalidatePath("/", "layout");
  return { success: true };
}
