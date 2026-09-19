import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function CrcCustodyLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading CRC custody" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div>
            <div className="h-7 w-40 rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" />
          </div>
          <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface sm:grid-cols-2">
            <div className="h-24 bg-surface-muted/35 p-4 sm:p-5" />
            <div className="h-24 border-t border-border-subtle bg-surface-muted/35 p-4 sm:border-l sm:border-t-0 sm:p-5" />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <div className="h-72 rounded-[var(--radius-md)] bg-surface-muted" />
            <div className="h-80 rounded-[var(--radius-md)] bg-surface-muted" />
          </div>
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
