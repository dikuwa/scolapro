import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function StaffLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading staff directory" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div className="h-7 w-44 rounded-[var(--radius-sm)] bg-surface-muted" />
          <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface sm:grid-cols-3">
            <div className="h-24 bg-surface-muted/35" />
            <div className="h-24 border-t border-border-subtle bg-surface-muted/35 sm:border-l sm:border-t-0" />
            <div className="h-24 border-t border-border-subtle bg-surface-muted/35 sm:border-l sm:border-t-0" />
          </div>
          <div className="h-80 rounded-[var(--radius-md)] bg-surface-muted" />
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
