export default function Loading() {
  return (
    <main className="bg-background px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading Conduct">
      <div className="scolapro-content-width animate-pulse space-y-5">
        <div>
          <div className="h-7 w-36 rounded-[var(--radius-sm)] bg-surface-subtle" />
          <div className="mt-2 h-4 w-80 max-w-full rounded-[var(--radius-xs)] bg-surface-subtle" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-20 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="h-80 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
          <div className="h-80 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
        </div>
      </div>
    </main>
  );
}
