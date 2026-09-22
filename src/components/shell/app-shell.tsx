import Link from "next/link";
import { Suspense } from "react";
import { ScolaProMark, ScolaProWordmark } from "@/components/brand/scolapro-brand";
import { AccountMenu } from "@/components/shell/account-menu";
import { MobileNavigation } from "@/components/shell/navigation";
import { ShellFrame } from "@/components/shell/shell-frame";
import { DestructiveActionGuard } from "@/components/ui/destructive-action-guard";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { OfflineRuntime } from "@/components/offline/offline-runtime";
import { getNavigationAttentionCounts, type NavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";
import { getNotificationInbox } from "@/features/notifications/server/notifications";
import { getUserContext } from "@/lib/auth/get-user-context";
import { SCOLAPRO_BRAND } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/config/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || SCOLAPRO_BRAND.initials;
}

async function ShellNotificationCenter({
  authenticatedUserId,
  currentSchoolId,
  roleKey,
}: {
  authenticatedUserId: string;
  currentSchoolId: string | null;
  roleKey?: string;
}) {
  const inbox = await getNotificationInbox(8, {
    currentSchoolId,
    roleKey,
    authenticatedUserId,
  });
  return (
    <NotificationCenter
      key={`${inbox.unreadCount}:${inbox.notifications.map((item) => `${item.id}:${item.readAt ?? "unread"}`).join("|")}`}
      unreadCount={inbox.unreadCount}
      notifications={inbox.notifications}
    />
  );
}

function Avatar({ url, name, size = "size-8" }: { url: string | null; name: string; size?: string }) {
  return (
    <span className={`relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-surface-subtle text-[0.68rem] font-semibold text-foreground`}>
      <span aria-hidden="true">{initials(name)}</span>
      {url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : null}
    </span>
  );
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  let displayName = `${SCOLAPRO_BRAND.name} User`;
  let schoolName = isSupabaseConfigured() ? "No school selected" : `${SCOLAPRO_BRAND.name} Demonstration School`;
  let roleKey: string | undefined;
  let roleKeys: string[] = [];
  let extraNavigationKeys: string[] = [];
  let avatarUrl: string | null = null;
  let attentionCounts: NavigationAttentionCounts = {};
  let offlineScope: { userId: string; tenantId: string; schoolId: string } | null = null;
  let notificationContext: { authenticatedUserId: string; currentSchoolId: string | null; roleKey?: string } | null = null;

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (context.user) {
      displayName = context.displayName ?? displayName;
      const platformMembership = context.platformMemberships[0];
      const membership = platformMembership ? undefined : context.currentSchoolMembership ?? undefined;
      const networkMembership = platformMembership || membership ? undefined : context.networkMemberships[0];
      const guardianOnly = !membership && !platformMembership && !networkMembership && context.guardianLinks.length > 0;
      offlineScope = membership ? { userId: context.user.id, tenantId: membership.tenantId, schoolId: membership.schoolId } : null;

      schoolName = platformMembership
        ? `${SCOLAPRO_BRAND.name} Platform`
        : membership?.schoolName ?? (networkMembership ? "Education network" : guardianOnly ? "Family portal" : "No school selected");
      roleKey = platformMembership?.roleKey ?? membership?.roleKey ?? networkMembership?.roleKey ?? (guardianOnly ? "parent" : undefined);
      roleKeys = platformMembership
        ? [platformMembership.roleKey]
        : membership
          ? [...new Set(context.memberships.map((item) => item.roleKey))]
          : networkMembership
            ? [...new Set(context.networkMemberships.map((item) => item.roleKey))]
            : guardianOnly
              ? ["parent"]
              : [];

      if (!membership) {
        const networkRoles = new Set(context.networkMemberships.map((item) => item.roleKey));
        if (networkRoles.has("circuit_officer")) extraNavigationKeys.push("dnea_readiness", "statutory");
        if (networkRoles.has("regional_officer")) extraNavigationKeys.push("statutory");
      }

      const needsDutyLookup = Boolean(
        membership
        && !["school_admin", "principal", "deputy_principal"].includes(membership.roleKey)
        && membership.staffMemberId,
      );
      const staffMemberIds = membership
        ? [...new Set(context.memberships.map((item) => item.staffMemberId).filter((staffMemberId): staffMemberId is string => Boolean(staffMemberId)))]
        : [];
      const needsInventoryLookup = Boolean(
        membership
        && !roleKeys.some((role) => ["school_admin", "principal", "deputy_principal"].includes(role))
        && staffMemberIds.length,
      );
      const today = (needsDutyLookup || needsInventoryLookup)
        ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
        : null;
      const shellSupabase = (needsDutyLookup || needsInventoryLookup || context.avatarPath)
        ? await createSupabaseServerClient()
        : null;

      const dutyPromise = needsDutyLookup && shellSupabase && membership?.staffMemberId && today
        ? shellSupabase
            .from("school_duty_assignments")
            .select("id")
            .eq("school_id", membership.schoolId)
            .eq("staff_member_id", membership.staffMemberId)
            .eq("duty_key", "late_arrival_recorder")
            .lte("active_from", today)
            .or(`active_to.is.null,active_to.gte.${today}`)
            .limit(1)
        : Promise.resolve({ data: [] as Array<{ id: string }> });

      const inventoryPromise = needsInventoryLookup && shellSupabase && membership && today
        ? shellSupabase
            .from("room_inventory_custodians")
            .select("id")
            .eq("school_id", membership.schoolId)
            .in("staff_member_id", staffMemberIds)
            .lte("effective_from", today)
            .or(`effective_to.is.null,effective_to.gte.${today}`)
            .limit(1)
        : Promise.resolve({ data: [] as Array<{ id: string }> });

      const attentionPromise = membership
        ? getNavigationAttentionCounts(membership.schoolId, membership.roleKey)
        : Promise.resolve({});

      const [dutyResult, inventoryResult, navigationAttention] = await Promise.all([
        dutyPromise,
        inventoryPromise,
        attentionPromise,
      ]);

      if (dutyResult.data?.length) extraNavigationKeys.push("late_arrivals");
      if (inventoryResult.data?.length) extraNavigationKeys.push("room_inventory");
      extraNavigationKeys = [...new Set(extraNavigationKeys)];

      if (context.avatarPath && shellSupabase) {
        avatarUrl = shellSupabase.storage.from("avatars").getPublicUrl(context.avatarPath).data.publicUrl;
      }

      attentionCounts = navigationAttention;
      notificationContext = {
        authenticatedUserId: context.user.id,
        currentSchoolId: membership?.schoolId ?? null,
        roleKey,
      };
    }
  }

  const roleLabel = roleKey ? roleKey.replaceAll("_", " ") : "Design preview";
  const avatar = <Avatar url={avatarUrl} name={displayName} />;

  const brand = (
    <Link href="/" className="mb-5 flex min-h-11 items-center rounded-[var(--radius-sm)] px-2 py-2 transition-colors duration-[var(--motion-fast)] hover:bg-surface-muted group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-1">
      <span className="hidden group-data-[collapsed=true]/sidebar:inline-flex">
        <ScolaProMark className="size-9 shrink-0" />
      </span>
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
        <div className="min-w-0 lg:hidden">
          <ScolaProWordmark compact />
          <span className="block max-w-[12rem] truncate text-[0.68rem] text-muted-foreground sm:max-w-xs">{schoolName}</span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {notificationContext ? (
            <Suspense fallback={<NotificationCenter unreadCount={0} notifications={[]} />}>
              <ShellNotificationCenter {...notificationContext} />
            </Suspense>
          ) : (
            <NotificationCenter unreadCount={0} notifications={[]} />
          )}
          <AccountMenu avatar={<Avatar url={avatarUrl} name={displayName} />} displayName={displayName} roleLabel={roleLabel} />
        </div>
      </div>
    </header>
  );

  return (
    <ShellFrame brand={brand} footer={footer} header={header} roleKey={roleKey} roleKeys={roleKeys} extraNavigationKeys={extraNavigationKeys} attentionCounts={attentionCounts}>
      {children}
      <MobileNavigation roleKey={roleKey} roleKeys={roleKeys} extraKeys={extraNavigationKeys} attentionCounts={attentionCounts} />
      <DestructiveActionGuard />
      <OfflineRuntime scope={offlineScope} />
    </ShellFrame>
  );
}
