"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function LearnerCumulativeRecordError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Learner cumulative record route failed", {
    message: error.message,
    digest: error.digest,
  });

  return (
    <RouteErrorState
      title="Cumulative record could not be loaded"
      description="ScolaPro could not complete one of the governed cumulative-record queries. No record has been changed. Retry the page, or return to the learner list if the problem continues."
      reset={reset}
      retryLabel="Retry"
      reference={error.digest}
      secondaryHref="/learners"
      secondaryLabel="Back to learners"
    />
  );
}
