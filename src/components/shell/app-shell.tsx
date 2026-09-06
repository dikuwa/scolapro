import Link from "next/link";
import { ScolaProMark, ScolaProWordmark } from "@/components/brand/scolapro-brand";
import { AccountMenu } from "@/components/shell/account-menu";
import { MobileNavigation } from "@/components/shell/navigation";
import { ShellFrame } from "@/components/shell/shell-frame";
import { DestructiveActionGuard } from "@/components/ui/destructive-action-guard";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { getNavigationAttentionCounts, type NavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";
import { getNotificationInbox } from "@/features/notifications/server/notifications";
import { getUserContext } from "@/lib/auth/get-user-context";
import { SCOLAPRO_BRAND } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/config/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || SCOLAPRO_BRAND.initials;
}

function Avatar({ url, name, size = "size-8" }: { url: string | null; name: string; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-surface-subtle text-[0.68rem] font-semibold text-foreground`}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  let displayName = `${SCOLAPRO_BRAND.name} User`;
  let schoolName = isSupabaseConfigured() ? "No school selected" : `${SCOLAPRO_BRAND.name} Demonstration School`;
  let roleKey: string | undefined;
  let avatarUrl: string | null = null;
  let unreadCount = 0;
  let attentionCounts: NavigationAttentionCounts = {};
  let notifications: Awaited<ReturnType<typeof getNotificationInbox>>["notifications"] = [];

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (context.user) {
      displayName = context.displayName ?? displayName;
      const platformMembership = context.platformMemberships[0];
      const membership = platformMembership ? undefined : context.memberships[0];
      const guardianOnly = !membership && !platformMembership && context.guardianLinks.length > 0;

      schoolName = platformMembership
        ? `${SCOLAPRO_BRAND.name} Platform`
        : membership?.schoolName ?? (guardianOnly ? "Family portal" : "No school selected");
      roleKey = platformMembership?.roleKey ?? membership?.roleKey ?? (guardianOnly ? "parent" : undefined);

      if (context.avatarPath) {
        const supabase = await createSupabaseServerClient();
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(context.avatarPath).data.publicUrl;
      }

      const [inbox, navigationAttention] = await Promise.all([
        getNotificationInbox(),
        membership
          ? getNavigationAttentionCounts(membership.schoolId, membership.roleKey)
          : Promise.resolve({}),
      ]);
      unreadCount = inbox.unreadCount;
      notifications = inbox.notifications;
      attentionCounts = navigationAttention;
    }
  }

  const roleLabel = roleKey ? roleKey.replaceAll("_", " ") : "Design preview";
  const avatar = <Avatar url={avatarUrl} name={displayName} />;

  const brand = (
    <Link href="/" className="mb-5 flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors duration-[var(--motion-fast)] hover:bg-surface-muted group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-1">
      <ScolaProMark className="size-9 shrink-0" />
      <span className="min-w-0 group-data-[collapsed=true]/sidebar:hidden">
        <ScolaProWordmark compact />
        <span className="mt-0.5 block truncate text-[0.68rem] font-normal tracking-normal text-muted-foreground">{schoolName}</span>
      </span>
    </Link>
  );

  const footer = <AccountMenu avatar={avatar} displayName={displayName} roleLabel={roleLabel} compact />;

  const header = (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-[color:var(--surface)]/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-[var(--content-max)] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 lg:hidden">
          <ScolaProMark className="size-9 shrink-0" />
          <span className="min-w-0">
            <ScolaProWordmark compact />
            <span className="block max-w-[12rem] truncate text-[0.68rem] text-muted-foreground sm:max-w-xs">{schoolName}</span>
          </span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <NotificationCenter unreadCount={unreadCount} notifications={notifications} />
          <AccountMenu avatar={<Avatar url={avatarUrl} name={displayName} />} displayName={displayName} roleLabel={roleLabel} />
        </div>
      </div>
    </header>
  );

  return (
    <ShellFrame brand={brand} footer={footer} header={header} roleKey={roleKey} attentionCounts={attentionCounts}>
      {children}
      <MobileNavigation roleKey={roleKey} attentionCounts={attentionCounts} />
      <DestructiveActionGuard />
    </ShellFrame>
  );
}
