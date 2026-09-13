import { Spinner } from "@/components/ui/spinner";

export function RouteLoadingIndicator() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] grid place-items-center"
      aria-live="polite"
    >
      {/* Intentionally neutral: inherits text-muted-foreground from Spinner default
          so the route loader is understated against the dashboard grey background
          and does not compete visually with white skeleton cards. */}
      <Spinner className="size-5" />
    </div>
  );
}
