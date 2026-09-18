import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function TeachingFilesLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading teaching files" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div>
            <div className="h-7 w-44 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" />
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 rounded-[var(--radius-sm)] bg-surface-muted" />
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-10 rounded-[var(--radius-sm)] bg-surface-muted" />
              ))}
            </div>
          </div>
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-40 rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]" />
          ))}
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
