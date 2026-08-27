"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DesktopNavigation, SettingsNavigationLink } from "@/components/shell/navigation";

export function ShellFrame({
  children,
  brand,
  footer,
  header,
  roleKey,
}: {
  children: React.ReactNode;
  brand: React.ReactNode;
  footer: React.ReactNode;
  header: React.ReactNode;
  roleKey?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="min-h-screen bg-background text-foreground lg:grid lg:transition-[grid-template-columns] lg:duration-[var(--motion-base)] lg:ease-[var(--ease-standard)]"
      style={{
        gridTemplateColumns: collapsed
          ? "var(--sidebar-collapsed-width) minmax(0,1fr)"
          : "var(--sidebar-width) minmax(0,1fr)",
      }}
    >
      <aside
        data-collapsed={collapsed}
        className="group/sidebar relative hidden border-r border-border-subtle bg-surface lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:p-3"
      >
        <div className="min-w-0">
          {brand}
          <DesktopNavigation roleKey={roleKey} collapsed={collapsed} />
        </div>

        <div className="space-y-2 border-t border-border-subtle pt-3">
          <SettingsNavigationLink collapsed={collapsed} />
          {footer}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-16 z-40 grid size-6 -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated text-muted-foreground shadow-[var(--shadow-xs)] transition duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-surface-muted hover:text-foreground focus-visible:text-foreground"
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          ) : (
            <ChevronLeft aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          )}
        </button>
      </aside>

      <div className="min-w-0">
        {header}
        <main className="px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-24 lg:px-8 lg:py-7 lg:pb-7">
          <div className="scolapro-content-width">{children}</div>
        </main>
      </div>
    </div>
  );
}