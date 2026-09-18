import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function TeachingCoverageLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading coverage workspace" className="scolapro-content-width space-y-5 pb-10">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div className="h-5 w-24 rounded-[var(--radius-xs)] bg-surface-muted" />
          <div>
            <div className="h-7 w-60 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" />
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
            <div className="mb-4 h-5 w-48 rounded bg-surface-muted" />
            <div className="h-4 w-80 rounded bg-surface-muted" />
            <div className="mt-4 h-10 w-72 rounded bg-surface-muted" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-[var(--radius-sm)] bg-surface-muted" />
              ))}
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
            <div className="mb-4 h-5 w-40 rounded bg-surface-muted" />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="space-y-1.5">
                    <div className="h-4 w-56 rounded bg-surface-muted" />
                    <div className="h-3 w-40 rounded bg-surface-muted" />
                  </div>
                  <div className="h-7 w-28 rounded bg-surface-muted" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
