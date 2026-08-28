import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <main className="relative min-h-[70vh] bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="scolapro-content-width animate-pulse">
        <div className="h-7 w-56 rounded-[var(--radius-sm)] bg-surface-subtle" />
        <div className="mt-2 h-4 w-72 max-w-full rounded-[var(--radius-xs)] bg-surface-subtle" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
          ))}
        </div>
        <div className="mt-5 h-96 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
      </div>
      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center" aria-live="polite" aria-label="Loading">
        <Spinner className="size-6 text-brand sm:size-7" />
      </div>
    </main>
  );
}