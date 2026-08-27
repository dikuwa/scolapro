"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  Building2,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  MailPlus,
  MoreHorizontal,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";

const navigation = [
  { key: "today", label: "Today", href: "/", icon: LayoutDashboard },
  { key: "tenants", label: "Tenants", href: "/platform/tenants", icon: Building2 },
  { key: "invitations", label: "Invitations", href: "/platform/invitations", icon: MailPlus },
  { key: "setup", label: "Academic setup", href: "/school/setup", icon: SlidersHorizontal },
  { key: "learners", label: "Learners", href: "/learners", icon: Users },
  { key: "teaching", label: "Teaching", href: "/teaching", icon: BookOpenText },
  { key: "assessment", label: "Assessment", href: "/assessment", icon: ClipboardCheck },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
] as const;

const enabledKeysByRole: Record<string, readonly string[]> = {
  platform_admin: ["today", "tenants", "invitations"],
  platform_support: ["today", "tenants"],
  school_admin: ["today", "setup", "invitations", "learners", "calendar"],
  principal: ["today", "learners", "assessment", "calendar"],
  deputy_principal: ["today", "learners", "assessment", "calendar"],
  hod: ["today", "learners", "teaching", "assessment", "calendar"],
  teacher: ["today", "learners", "teaching", "assessment", "calendar"],
  class_teacher: ["today", "learners", "teaching", "assessment", "calendar"],
  counsellor: ["today", "learners", "calendar"],
  librarian: ["today", "learners"],
  learner: ["today", "teaching", "assessment", "calendar"],
  parent: ["today", "learners", "assessment"],
  board_member: ["today"],
};

function itemsForRole(roleKey?: string) {
  if (!roleKey) return navigation;
  const allowed = enabledKeysByRole[roleKey] ?? ["today"];
  return navigation.filter((item) => allowed.includes(item.key));
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNavigation({ roleKey, collapsed = false }: { roleKey?: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const items = itemsForRole(roleKey);

  return (
    <nav aria-label="Primary" className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            className={[
              "flex min-h-10 items-center rounded-[var(--radius-sm)] text-sm font-medium transition-colors duration-[var(--motion-fast)]",
              collapsed ? "justify-center px-2" : "gap-3 px-3",
              active
                ? "bg-brand-soft text-brand-strong"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            ].join(" ")}
          >
            <Icon aria-hidden="true" className="size-[1.05rem] shrink-0" strokeWidth={1.8} />
            {!collapsed ? <span>{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigation({ roleKey }: { roleKey?: string }) {
  const pathname = usePathname();
  const roleItems = itemsForRole(roleKey).slice(0, 4);
  const mobileItems = [...roleItems, { key: "more", label: "More", href: "/settings", icon: MoreHorizontal }] as const;

  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-[color:var(--surface)]/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
    >
      <div
        className="mx-auto grid max-w-xl gap-1"
        style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
      >
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[0.68rem] font-medium transition duration-[var(--motion-fast)]",
                active ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              ].join(" ")}
            >
              <Icon aria-hidden="true" className="size-[1.05rem]" strokeWidth={1.9} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SettingsNavigationLink({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, "/settings");

  return (
    <Link
      href="/settings"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? "Settings" : undefined}
      title={collapsed ? "Settings" : undefined}
      className={[
        "flex min-h-10 items-center rounded-[var(--radius-sm)] text-sm font-medium transition duration-[var(--motion-fast)]",
        collapsed ? "justify-center px-2" : "gap-3 px-3",
        active ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      ].join(" ")}
    >
      <Settings aria-hidden="true" className="size-[1.05rem] shrink-0" strokeWidth={1.8} />
      {!collapsed ? <span>Settings</span> : null}
    </Link>
  );
}
