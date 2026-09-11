import { Spinner } from "@/components/ui/spinner";

export function RouteLoadingIndicator() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] grid place-items-center"
      aria-live="polite"
    >
      <Spinner className="size-5 text-[color:var(--background)]" />
    </div>
  );
}
