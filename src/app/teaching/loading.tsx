import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function TeachingLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading Teaching" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div>
            <div className="h-7 w-40 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" />
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="h-10 rounded bg-surface-muted" />
              <div className="h-10 rounded bg-surface-muted" />
              <div className="h-10 rounded bg-surface-muted" />
              <div className="h-10 rounded bg-surface-muted" />
            </div>
          </div>
          <div className="flex gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-9 w-28 shrink-0 rounded-[var(--radius-xs)] bg-surface" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]" />
            ))}
          </div>
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
