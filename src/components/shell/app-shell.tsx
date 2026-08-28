import Link from "next/link";
import { GraduationCap, LogOut } from "lucide-react";
import { MobileNavigation } from "@/components/shell/navigation";
import { ShellFrame } from "@/components/shell/shell-frame";
import { signOut } from "@/features/auth/actions";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { getNotificationInbox } from "@/features/notifications/server/notifications";
import { getUserContext } from "@/lib/auth/get-user-context";
import { isSupabaseConfigured } from "@/lib/config/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SP";
}

function Avatar({ url, name, size = "size-8" }: { url: string | null; name: string; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-surface-subtle text-[0.68rem] font-semibold text-foreground`}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  let displayName = "ScolaPro User";
  let schoolName = "ScolaPro Demonstration School";
  let roleKey: string | undefined;
  let avatarUrl: string | null = null;
  let unreadCount = 0;
  let notifications: Awaited<ReturnType<typeof getNotificationInbox>>["notifications"] = [];

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (context.user) {
      displayName = context.displayName ?? displayName;
      const membership = context.memberships[0];
      schoolName = membership?.schoolName ?? (context.platformMemberships.length ? "ScolaPro Platform" : "No school selected");
      roleKey = membership?.roleKey ?? context.platformMemberships[0]?.roleKey;

      if (context.avatarPath) {
        const supabase = await createSupabaseServerClient();
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(context.avatarPath).data.publicUrl;
      }

      const inbox = await getNotificationInbox();
      unreadCount = inbox.unreadCount;
      notifications = inbox.notifications;
    }
  }

  const brand = (
    <Link href="/" className="mb-5 flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 text-[0.95rem] font-semibold tracking-[-0.02em] transition-colors duration-[var(--motion-fast)] hover:bg-surface-muted group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-1">
      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand text-white shadow-[var(--shadow-xs)]"><GraduationCap aria-hidden="true" className="size-5" /></span>
      <span className="min-w-0 group-data-[collapsed=true]/sidebar:hidden"><span className="block">ScolaPro</span><span className="mt-0.5 block truncate text-[0.68rem] font-normal tracking-normal text-muted-foreground">{schoolName}</span></span>
    </Link>
  );

  const footer = (
    <div className="space-y-1">
      <Link href="/settings" className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 transition hover:bg-surface-muted group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-1">
        <Avatar url={avatarUrl} name={displayName} />
        <div className="min-w-0 group-data-[collapsed=true]/sidebar:hidden"><p className="truncate text-xs font-medium text-foreground">{displayName}</p><p className="truncate text-[0.68rem] capitalize text-muted-foreground">{roleKey ? roleKey.replaceAll("_", " ") : "Design preview"}</p></div>
      </Link>
      <form action={signOut}>
        <button type="submit" className="flex min-h-9 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-xs font-medium text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)] group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-1" aria-label="Log out" title="Log out">
          <LogOut aria-hidden="true" className="size-4 shrink-0" />
          <span className="group-data-[collapsed=true]/sidebar:hidden">Log out</span>
        </button>
      </form>
    </div>
  );

  const header = (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-[color:var(--surface)]/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-[var(--content-max)] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 lg:hidden">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand text-white"><GraduationCap aria-hidden="true" className="size-5" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">ScolaPro</span><span className="block max-w-[12rem] truncate text-[0.68rem] text-muted-foreground sm:max-w-xs">{schoolName}</span></span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <NotificationCenter unreadCount={unreadCount} notifications={notifications} />
          <Link href="/settings" aria-label="Account settings" className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 transition hover:bg-surface-muted">
            <Avatar url={avatarUrl} name={displayName} />
            <span className="hidden max-w-40 truncate text-xs font-medium sm:block">{displayName}</span>
          </Link>
          <form action={signOut} className="hidden sm:block">
            <button type="submit" aria-label="Log out" title="Log out" className="grid size-9 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)]">
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );

  return (
    <ShellFrame brand={brand} footer={footer} header={header} roleKey={roleKey}>
      {children}
      <MobileNavigation roleKey={roleKey} />
    </ShellFrame>
  );
}
