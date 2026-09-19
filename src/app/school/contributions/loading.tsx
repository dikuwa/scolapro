import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function ContributionsLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading voluntary contributions" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div className="h-7 w-52 rounded-[var(--radius-sm)] bg-surface-muted" />
          <div className="h-72 rounded-[var(--radius-md)] bg-surface-muted" />
          <div className="h-64 rounded-[var(--radius-md)] bg-surface-muted" />
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
