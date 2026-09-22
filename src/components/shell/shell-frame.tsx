"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DesktopNavigation, MobileNavigation } from "@/components/shell/navigation";
import type { NavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";

export function ShellFrame({
  children,
  brand,
  footer,
  header,
  roleKey,
  roleKeys = [],
  extraNavigationKeys = [],
  attentionCounts = {},
  attentionCacheKey = null,
}: {
  children: React.ReactNode;
  brand: React.ReactNode;
  footer: React.ReactNode;
  header: React.ReactNode;
  roleKey?: string;
  roleKeys?: readonly string[];
  extraNavigationKeys?: readonly string[];
  attentionCounts?: NavigationAttentionCounts;
  attentionCacheKey?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [resolvedAttentionCounts, setResolvedAttentionCounts] = useState<NavigationAttentionCounts>(attentionCounts);

  useEffect(() => {
    if (!attentionCacheKey) return;
    const storageKey = `scolapro:navigation-attention:${attentionCacheKey}`;
    try {
      const cached = window.sessionStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { expiresAt?: number; counts?: NavigationAttentionCounts };
        if ((parsed.expiresAt ?? 0) > Date.now() && parsed.counts) {
          const frame = window.requestAnimationFrame(() => setResolvedAttentionCounts(parsed.counts ?? {}));
          return () => window.cancelAnimationFrame(frame);
        }
      }
    } catch {
      // Attention badges are supplemental. Storage failure must not affect navigation.
    }

    const controller = new AbortController();
    void fetch("/api/navigation-attention", {
      credentials: "same-origin",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => response.ok ? response.json() as Promise<{ counts?: NavigationAttentionCounts }> : { counts: {} })
      .then((payload) => {
        const counts = payload.counts ?? {};
        setResolvedAttentionCounts(counts);
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify({
            counts,
            expiresAt: Date.now() + 30_000,
          }));
        } catch {
          // Supplemental cache only.
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResolvedAttentionCounts({});
        }
      });

    return () => controller.abort();
  }, [attentionCacheKey]);

  return (
    <div
      className="relative min-h-screen bg-background text-foreground lg:grid lg:items-start lg:transition-[grid-template-columns] lg:duration-[var(--motion-base)] lg:ease-[var(--ease-standard)]"
      style={{
        gridTemplateColumns: collapsed
          ? "var(--sidebar-collapsed-width) minmax(0,1fr)"
          : "var(--sidebar-width) minmax(0,1fr)",
      }}
    >
      <aside
        data-collapsed={collapsed}
        className="scolapro-scrollbar group/sidebar relative hidden border-r border-border-subtle bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:overflow-y-auto lg:p-3"
      >
        <div className="min-w-0">
          {brand}
          <DesktopNavigation roleKey={roleKey} roleKeys={roleKeys} extraKeys={extraNavigationKeys} collapsed={collapsed} attentionCounts={resolvedAttentionCounts} />
        </div>

        <div className="border-t border-border-subtle bg-surface pt-3">{footer}</div>
      </aside>

      <div className="relative min-w-0">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{ left: collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)" }}
          className="fixed top-16 z-[160] hidden size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated text-muted-foreground shadow-[var(--shadow-sm)] transition-[left,background-color,color,box-shadow] duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:bg-surface hover:text-foreground focus-visible:text-foreground lg:grid"
        >
          {collapsed ? <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2} /> : <ChevronLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />}
        </button>

        {header}
        <MobileNavigation roleKey={roleKey} roleKeys={roleKeys} extraKeys={extraNavigationKeys} attentionCounts={resolvedAttentionCounts} />
        <main className="px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-24 lg:px-8 lg:py-7 lg:pb-7">
          <div className="scolapro-content-width">{children}</div>
        </main>
      </div>
    </div>
  );
}
