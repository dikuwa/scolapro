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

export type NotificationInboxContext = {
  currentSchoolId?: string | null;
  roleKey?: string;
  authenticatedUserId?: string | null;
};

export async function getNotificationInbox(limit = 8, context: NotificationInboxContext = {}) {
  const supabase = await createSupabaseServerClient();
  const recipientUserId = context.authenticatedUserId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
  if (!recipientUserId) return { unreadCount: 0, notifications: [] as UserNotification[] };

  const [{ count, error: countError }, { data, error }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", recipientUserId)
      .is("dismissed_at", null)
      .is("read_at", null),
    supabase
      .from("notifications")
      .select("id,severity,title,body,href,read_at,created_at")
      .eq("recipient_user_id", recipientUserId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (countError || error) throw new Error("Unable to load notifications.");

  return {
    unreadCount: count ?? 0,
    notifications: (data ?? []).map((item) => ({
      id: item.id,
      severity: item.severity as UserNotification["severity"],
      title: item.title,
      body: item.body,
      href:
        item.title === "School invitation accepted"
        && item.href === "/platform/invitations"
        && context.roleKey === "school_admin"
        && context.currentSchoolId
          ? "/school/invitations"
          : item.href,
      readAt: item.read_at,
      createdAt: item.created_at,
    })),
  };
}
