"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function AbsenceReviewsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="Absence reviews could not load"
      description="The daily register and subject-period review data could not be loaded. No attendance or guardian notice was changed."
      reset={reset}
    />
  );
}
