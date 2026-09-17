import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function SchoolDirectoryLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading School Directory" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div><div className="h-7 w-56 rounded-[var(--radius-sm)] bg-surface-muted" /><div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" /></div>
          <div className="grid gap-3 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:grid-cols-2 lg:grid-cols-4"><div className="h-10 rounded bg-surface-muted" /><div className="h-10 rounded bg-surface-muted" /><div className="h-10 rounded bg-surface-muted" /><div className="h-10 rounded bg-surface-muted" /></div>
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-32 rounded-[var(--radius-sm)] bg-surface-muted" />)}</div>
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
