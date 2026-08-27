"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  Users,
} from "lucide-react";

const navigation = [
  { label: "Today", href: "/", icon: LayoutDashboard },
  { label: "Learners", href: "/learners", icon: Users },
  { label: "Teaching", href: "/teaching", icon: BookOpenText },
  { label: "Assessment", href: "/assessment", icon: ClipboardCheck },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="space-y-1">
      {navigation.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200",
              active
                ? "bg-brand-soft text-brand-strong"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            ].join(" ")}
          >
            <Icon aria-hidden="true" className="size-[1.05rem]" strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();
  const mobileItems = [...navigation.slice(0, 4), { label: "More", href: "/settings", icon: MoreHorizontal }] as const;

  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-[color:var(--surface)]/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.68rem] font-medium transition duration-200",
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

export function SettingsNavigationLink() {
  const pathname = usePathname();
  const active = isActive(pathname, "/settings");

  return (
    <Link
      href="/settings"
      aria-current={active ? "page" : undefined}
      className={[
        "flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition duration-200",
        active ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      ].join(" ")}
    >
      <Settings aria-hidden="true" className="size-[1.05rem]" strokeWidth={1.8} />
      Settings
    </Link>
  );
}
