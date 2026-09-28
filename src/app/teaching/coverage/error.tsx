"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function TeachingCoverageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Coverage could not load" description="The coverage workspace could not load your allocations or schedule items. Your data was not changed." reset={reset} secondaryHref="/teaching" secondaryLabel="Teaching" />;
}
