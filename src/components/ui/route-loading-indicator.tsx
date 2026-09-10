import { Spinner } from "@/components/ui/spinner";

export function RouteLoadingIndicator() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center" aria-live="polite">
      <span className="grid size-10 place-items-center rounded-full border border-border-subtle bg-surface-elevated shadow-[var(--shadow-sm)]">
        <Spinner className="size-5" />
      </span>
    </div>
  );
}
