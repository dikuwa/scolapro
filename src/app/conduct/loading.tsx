export default function Loading() {
  return (
    <main className="bg-background px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading Conduct">
      <div className="scolapro-content-width animate-pulse space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="h-7 w-36 rounded-[var(--radius-sm)] bg-surface-subtle" />
            <div className="mt-2 h-4 w-80 max-w-full rounded-[var(--radius-xs)] bg-surface-subtle" />
          </div>
          <div className="h-8 w-40 rounded-[var(--radius-xs)] bg-surface-subtle" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-10 w-full rounded-[var(--radius-sm)] bg-surface-muted sm:w-56" />
          <div className="h-10 w-28 rounded-[var(--radius-sm)] bg-surface-subtle" />
        </div>
        <div className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 rounded-[var(--radius-sm)] bg-surface" />)}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="h-5 w-32 rounded-[var(--radius-xs)] bg-surface-subtle" />
          <div className="mt-2 h-4 w-96 max-w-full rounded-[var(--radius-xs)] bg-surface-subtle" />
          <div className="mt-5 space-y-4">
            {[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-[var(--radius-sm)] bg-surface-muted" />)}
          </div>
        </div>
      </div>
    </main>
  );
}
