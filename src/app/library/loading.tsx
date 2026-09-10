import { AppShell } from "@/components/shell/app-shell";
import { RouteLoadingIndicator } from "@/components/ui/route-loading-indicator";

export default function LibraryLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading Library and Textbooks" className="space-y-5">
        <div aria-hidden="true" className="animate-pulse space-y-5">
          <div><div className="h-7 w-56 rounded-[var(--radius-sm)] bg-surface-muted" /><div className="mt-2 h-4 w-full max-w-2xl rounded-[var(--radius-xs)] bg-surface-muted" /></div>
          <div className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]"><div className="h-5 w-28 rounded bg-surface-muted" /><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="h-10 rounded bg-surface-muted" /><div className="h-10 rounded bg-surface-muted" /></div><div className="mt-5 space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 rounded-[var(--radius-sm)] bg-surface-muted" />)}</div></div>
          <div className="grid gap-5 xl:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <div key={index} className="h-96 rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]" />)}</div>
        </div>
        <RouteLoadingIndicator />
      </section>
    </AppShell>
  );
}
