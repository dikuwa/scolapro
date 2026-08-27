import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { DesktopNavigation, MobileNavigation, SettingsNavigationLink } from "@/components/shell/navigation";
import { getUserContext } from "@/lib/auth/get-user-context";
import { isSupabaseConfigured } from "@/lib/config/runtime";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SP";
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  let displayName = "ScolaPro User";
  let schoolName = "ScolaPro Demonstration School";
  let roleKey: string | undefined;

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (context.user) {
      displayName = context.displayName ?? displayName;
      const membership = context.memberships[0];
      schoolName = membership?.schoolName ?? (context.platformMemberships.length ? "ScolaPro Platform" : "No school selected");
      roleKey = membership?.roleKey ?? context.platformMemberships[0]?.roleKey;
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <aside className="hidden border-r border-border/80 bg-surface lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:p-4">
        <div>
          <Link href="/" className="mb-5 flex items-center gap-3 rounded-xl px-2 py-2 text-[0.95rem] font-semibold tracking-[-0.02em]">
            <span className="grid size-9 place-items-center rounded-xl bg-brand text-white shadow-sm">
              <GraduationCap aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block">ScolaPro</span>
              <span className="mt-0.5 block truncate text-[0.68rem] font-normal tracking-normal text-muted-foreground">{schoolName}</span>
            </span>
          </Link>

          <DesktopNavigation roleKey={roleKey} />
        </div>

        <div className="space-y-2 border-t border-border/70 pt-3">
          <SettingsNavigationLink />
          <div className="flex items-center gap-2 rounded-xl px-2 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-subtle text-[0.68rem] font-semibold text-foreground">
              {initials(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
              <p className="truncate text-[0.68rem] text-muted-foreground">{roleKey ? roleKey.replaceAll("_", " ") : "Design preview"}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-[color:var(--surface)]/92 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white">
                <GraduationCap aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">ScolaPro</span>
                <span className="block max-w-[12rem] truncate text-[0.68rem] text-muted-foreground sm:max-w-xs">{schoolName}</span>
              </span>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-subtle text-[0.68rem] font-semibold text-foreground">
                {initials(displayName)}
              </span>
              <span className="hidden max-w-40 truncate text-xs font-medium sm:block">{displayName}</span>
            </div>
          </div>
        </header>

        <main className="px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-24 lg:px-8 lg:py-7 lg:pb-7">{children}</main>
      </div>

      <MobileNavigation roleKey={roleKey} />
    </div>
  );
}
