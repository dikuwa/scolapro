import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserNotification = {
  id: string;
  severity: "info" | "success" | "warning" | "danger";
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function getNotificationInbox(limit = 8) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { unreadCount: 0, notifications: [] as UserNotification[] };

  const [{ count }, { data, error }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .is("dismissed_at", null)
      .is("read_at", null),
    supabase
      .from("notifications")
      .select("id,severity,title,body,href,read_at,created_at")
      .eq("recipient_user_id", user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (error) throw new Error("Unable to load notifications.");

  return {
    unreadCount: count ?? 0,
    notifications: (data ?? []).map((item) => ({
      id: item.id,
      severity: item.severity as UserNotification["severity"],
      title: item.title,
      body: item.body,
      href: item.href,
      readAt: item.read_at,
      createdAt: item.created_at,
    })),
  };
}
