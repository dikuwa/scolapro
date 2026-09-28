"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function LearnerOverviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="Learner overview could not load"
      description="The current-school learner record could not be loaded. No learner identity, enrolment or guardian record was changed."
      reset={reset}
    />
  );
}
