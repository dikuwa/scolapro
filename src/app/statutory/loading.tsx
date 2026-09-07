import { AppShell } from "@/components/shell/app-shell";

export default function StatutoryLoading() {
  return (
    <AppShell>
      <section className="space-y-5" aria-busy="true" aria-label="Loading statutory reporting">
        <div className="space-y-2"><div className="h-7 w-56 animate-pulse rounded bg-surface-muted" /><div className="h-4 max-w-2xl animate-pulse rounded bg-surface-muted" /></div>
        <div className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-border-subtle sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse bg-surface" />)}</div>
        <div className="grid gap-4">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-48 animate-pulse rounded-[var(--radius-md)] border border-border-subtle bg-surface" />)}</div>
      </section>
    </AppShell>
  );
}
