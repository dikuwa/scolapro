import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function AbsenceReviewsLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading absence reviews" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div>
            <div className="h-7 w-48 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" />
          </div>
          <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 border-border-subtle bg-surface p-4 sm:p-5" />)}
          </div>
          <div className="h-11 rounded-[var(--radius-sm)] bg-surface-muted" />
          <div className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-10 rounded-[var(--radius-sm)] bg-surface" />)}
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
            <div className="h-5 w-44 rounded bg-surface-muted" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-24 rounded-[var(--radius-sm)] bg-surface-muted" />)}
            </div>
          </div>
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
