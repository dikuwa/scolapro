"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function LearnerSubjectsError({ reset }: { reset: () => void }) {
  return <RouteErrorState title="Subject assignments could not load" description="Your current school scope may have changed. Retry or return to Learners." reset={reset} retryLabel="Retry" secondaryHref="/learners" secondaryLabel="Back to learners" />;
}
