import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function LearnersLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading learners" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-4">
          <div className="h-7 w-40 rounded-[var(--radius-sm)] bg-surface-muted" />
          <div className="h-20 rounded-[var(--radius-md)] bg-surface-muted" />
          <div className="h-80 rounded-[var(--radius-md)] bg-surface-muted" />
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
