"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function ContributionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="Voluntary contributions could not load"
      description="Contribution campaigns and records could not be loaded. No contribution or campaign state was changed."
      reset={reset}
    />
  );
}
