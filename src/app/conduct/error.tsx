"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function ConductError({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Conduct unavailable"
      description="We could not load your school’s conduct records. Check your connection and try again."
      reset={reset}
    />
  );
}
