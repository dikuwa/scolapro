"use client";

import Link from "next/link";
import { Bell, CheckCheck, CircleAlert, CircleCheck, Info, Trash2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { clearNotifications, markAllNotificationsRead, markNotificationRead } from "@/features/notifications/server/actions";
import type { UserNotification } from "@/features/notifications/server/notifications";
import { Spinner } from "@/components/ui/spinner";

const toneBySeverity = {
  info: "scolapro-tone-sky",
  success: "scolapro-tone-mint",
  warning: "scolapro-tone-amber",
  danger: "scolapro-tone-rose",
} as const;

const iconBySeverity = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

export function NotificationCenter({ unreadCount, notifications }: { unreadCount: number; notifications: UserNotification[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-9 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
      >
        <Bell className="size-[1.05rem]" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[0.58rem] font-semibold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{unreadCount ? `${unreadCount} unread` : "You’re all caught up"}</p>
            </div>
            {pending ? <Spinner className="size-4" /> : null}
          </div>

          <div className="max-h-[25rem] overflow-y-auto">
            {notifications.length ? notifications.map((notification) => {
              const Icon = iconBySeverity[notification.severity];
              const content = (
                <div className={`flex gap-3 px-4 py-3 transition hover:bg-surface-muted/70 ${notification.readAt ? "opacity-75" : ""}`}>
                  <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] ${toneBySeverity[notification.severity]}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-foreground">{notification.title}</span>
                    {notification.body ? <span className="mt-0.5 block text-[0.68rem] leading-5 text-muted-foreground">{notification.body}</span> : null}
                    <span className="mt-1 block text-[0.64rem] text-muted-foreground/80">{new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt))}</span>
                  </span>
                  {!notification.readAt ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                </div>
              );

              return notification.href ? (
                <Link key={notification.id} href={notification.href} onClick={() => { setOpen(false); if (!notification.readAt) run(() => markNotificationRead(notification.id)); }}>
                  {content}
                </Link>
              ) : (
                <button key={notification.id} type="button" className="block w-full text-left" onClick={() => { if (!notification.readAt) run(() => markNotificationRead(notification.id)); }}>
                  {content}
                </button>
              );
            }) : (
              <div className="px-5 py-10 text-center">
                <span className="scolapro-tone-sky mx-auto grid size-10 place-items-center rounded-[var(--radius-md)]"><Bell className="size-4" aria-hidden="true" /></span>
                <p className="mt-3 text-sm font-medium">No notifications</p>
                <p className="mt-1 text-xs text-muted-foreground">Important school and platform updates will appear here.</p>
              </div>
            )}
          </div>

          {notifications.length ? (
            <div className="flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-muted/55 px-3 py-2">
              <button type="button" disabled={pending || unreadCount === 0} onClick={() => run(markAllNotificationsRead)} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-[0.68rem] font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-45">
                <CheckCheck className="size-3.5" aria-hidden="true" /> Mark all read
              </button>
              <button type="button" disabled={pending} onClick={() => run(clearNotifications)} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-[0.68rem] font-medium text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-45">
                <Trash2 className="size-3.5" aria-hidden="true" /> Clear
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
