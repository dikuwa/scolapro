import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function FinanceLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading finance workspace" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div>
            <div className="h-7 w-48 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="mt-2 h-4 w-full max-w-3xl rounded-[var(--radius-xs)] bg-surface-muted" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-80 rounded-[var(--radius-md)] bg-surface-muted" />
            <div className="h-80 rounded-[var(--radius-md)] bg-surface-muted" />
          </div>
          <div className="h-64 rounded-[var(--radius-md)] bg-surface-muted" />
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
