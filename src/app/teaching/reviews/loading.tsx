import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function PreparationReviewLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading preparation review" className="pb-10">
        <div aria-hidden="true" className="animate-pulse space-y-4">
          <div className="h-4 w-24 rounded-[var(--radius-xs)] bg-surface-muted" />
          <div>
            <div className="h-7 w-56 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" />
          </div>
          <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 sm:p-5">
            <div className="h-5 w-40 rounded bg-surface-muted" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 rounded-[var(--radius-sm)] bg-surface-muted" />
              ))}
            </div>
          </div>
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-40 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
          ))}
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}