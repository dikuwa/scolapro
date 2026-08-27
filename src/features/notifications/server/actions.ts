"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function markNotificationRead(notificationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id)
    .is("read_at", null);

  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("mark_all_notifications_read");
  revalidatePath("/", "layout");
}

export async function clearNotifications() {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("dismiss_all_notifications");
  revalidatePath("/", "layout");
}
