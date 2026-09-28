"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function ClassListsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="Class Lists could not load"
      description="The roster could not be prepared. Your saved presets remain on this device."
      reset={reset}
    />
  );
}
