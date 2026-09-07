import { AppShell } from "@/components/shell/app-shell";

export default function DneaReadinessLoading() {
  return <AppShell><section aria-busy="true" aria-label="Loading DNEA candidate readiness">
    <div className="mb-6"><div className="h-7 w-64 animate-pulse rounded-[var(--radius-xs)] bg-surface-muted" /><div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded-[var(--radius-xs)] bg-surface-muted" /></div>
    <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface sm:grid-cols-3">{[0,1,2].map((item) => <div key={item} className="px-5 py-4"><div className="h-3 w-24 animate-pulse rounded bg-surface-muted" /><div className="mt-2 h-7 w-12 animate-pulse rounded bg-surface-muted" /></div>)}</div>
    <div className="mt-5 rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]"><div className="h-5 w-48 animate-pulse rounded bg-surface-muted" /><div className="mt-5 space-y-3">{[0,1,2].map((item) => <div key={item} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />)}</div></div>
  </section></AppShell>;
}
