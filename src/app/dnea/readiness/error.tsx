"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function DneaReadinessError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="DNEA readiness could not be loaded"
      description="The readiness review is temporarily unavailable. No examination data was changed."
      reset={reset}
    />
  );
}
