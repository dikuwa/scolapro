"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function LearnersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="Learner directory could not load"
      description="Current learner identities and enrolments could not be loaded. No learner or enrolment record was changed."
      reset={reset}
    />
  );
}
