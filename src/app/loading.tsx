import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="scolapro-content-width relative animate-pulse">
        <div className="pointer-events-none absolute right-0 top-0 flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-4 sm:size-5" />
          <span className="hidden sm:inline">Loading workspace…</span>
        </div>
        <div className="h-7 w-56 rounded-[var(--radius-sm)] bg-surface-subtle" />
        <div className="mt-2 h-4 w-72 max-w-full rounded-[var(--radius-xs)] bg-surface-subtle" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
          ))}
        </div>
        <div className="mt-5 h-96 rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
      </div>
    </main>
  );
}
