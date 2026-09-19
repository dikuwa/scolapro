import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function SportsHousesLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading Sports and Houses" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div className="h-7 w-48 rounded-[var(--radius-sm)] bg-surface-muted" />
          <div className="h-28 rounded-[var(--radius-md)] bg-surface-muted" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="h-20 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="h-20 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="h-20 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="h-20 rounded-[var(--radius-sm)] bg-surface-muted" />
          </div>
          <div className="h-80 rounded-[var(--radius-md)] bg-surface-muted" />
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
