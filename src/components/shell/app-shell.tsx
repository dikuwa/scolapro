import Link from "next/link";
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Search,
  Settings,
  Users,
} from "lucide-react";

const navigation = [
  { label: "Today", href: "/", icon: LayoutDashboard },
  { label: "Learners", href: "/learners", icon: Users },
  { label: "Teaching", href: "/teaching", icon: BookOpenText },
  { label: "Assessment", href: "/assessment", icon: ClipboardCheck },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <aside className="hidden border-r border-border/80 bg-surface lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:p-4">
        <div>
          <Link href="/" className="mb-6 flex items-center gap-3 rounded-xl px-2 py-2 text-[0.95rem] font-semibold tracking-[-0.02em]">
            <span className="grid size-9 place-items-center rounded-xl bg-brand text-white shadow-sm">
              <GraduationCap aria-hidden="true" className="size-5" />
            </span>
            <span>ScolaPro</span>
          </Link>

          <nav aria-label="Primary" className="space-y-1">
            {navigation.map((item, index) => {
              const Icon = item.icon;
              const active = index === 0;

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
        </div>

        <div className="space-y-1 border-t border-border/70 pt-3">
          <Link
            href="/settings"
            className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-surface-muted hover:text-foreground"
          >
            <Settings aria-hidden="true" className="size-[1.05rem]" strokeWidth={1.8} />
            Settings
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-[color:var(--surface)]/92 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white">
                <GraduationCap aria-hidden="true" className="size-5" />
              </span>
              <span className="truncate text-sm font-semibold">ScolaPro</span>
            </div>

            <button
              type="button"
              className="hidden min-h-10 min-w-52 items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 text-left text-sm text-muted-foreground shadow-[var(--shadow-sm)] transition duration-200 hover:border-[color:var(--brand)]/35 hover:text-foreground md:flex lg:min-w-64"
            >
              <Search aria-hidden="true" className="size-4" />
              <span className="truncate">Search learners, classes, reports…</span>
              <kbd className="ml-auto rounded-md bg-surface-muted px-1.5 py-0.5 text-[0.68rem] text-muted-foreground">⌘K</kbd>
            </button>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Notifications"
                className="grid size-10 place-items-center rounded-xl text-muted-foreground transition duration-200 hover:bg-surface-muted hover:text-foreground"
              >
                <Bell aria-hidden="true" className="size-[1.1rem]" strokeWidth={1.8} />
              </button>

              <button
                type="button"
                className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-medium transition duration-200 hover:bg-surface-muted"
              >
                <span className="grid size-8 place-items-center rounded-full bg-surface-subtle text-xs font-semibold text-foreground">MM</span>
                <span className="hidden sm:inline">Martin</span>
                <ChevronDown aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
