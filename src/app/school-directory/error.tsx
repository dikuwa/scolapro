"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function SchoolDirectoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="School Directory could not load"
      description="The directory could not load school contact details. Your data was not changed."
      reset={reset}
    />
  );
}
