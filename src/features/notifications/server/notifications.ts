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

type NotificationInboxRpcRow = {
  unread_count: number | string | null;
  notifications: Array<{
    id: string;
    severity: string;
    title: string;
    body: string | null;
    href: string | null;
    read_at: string | null;
    created_at: string;
  }> | null;
};

export async function getNotificationInbox(limit = 8, context: NotificationInboxContext = {}) {
  const supabase = await createSupabaseServerClient();
  const recipientUserId = context.authenticatedUserId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
  if (!recipientUserId) return { unreadCount: 0, notifications: [] as UserNotification[] };

  const { data, error } = await supabase.rpc("get_my_notification_inbox", { p_limit: limit });
  if (error) throw new Error("Unable to load notifications.");

  const row = ((data ?? [])[0] ?? null) as NotificationInboxRpcRow | null;
  const unreadCount = Number(row?.unread_count ?? 0);

  return {
    unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
    notifications: (row?.notifications ?? []).map((item) => ({
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
