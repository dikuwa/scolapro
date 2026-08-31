import { AppShell } from "@/components/shell/app-shell";

function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[var(--radius-xs)] bg-surface-muted ${className}`} />;
}

export default function LearnerOverviewLoading() {
  return (
    <AppShell>
      <section aria-busy="true" aria-label="Loading learner overview">
        <Skeleton className="mb-4 h-5 w-20" />

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="size-16 shrink-0 rounded-[var(--radius-md)]" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-6 w-52 max-w-[60vw]" />
              <Skeleton className="h-4 w-72 max-w-[70vw]" />
            </div>
          </div>
          <Skeleton className="h-8 w-28" />
        </div>

        <div className="mb-5 border-b border-border-subtle pb-2">
          <Skeleton className="h-7 w-24" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </div>
            <div className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 sm:p-5">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-40 max-w-full" />
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-5">
            <section className="bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <Skeleton className="h-4 w-32" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </section>
            <section className="bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-20 w-full" />
            </section>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
