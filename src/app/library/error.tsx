"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function LibraryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      title="Library / Textbooks could not load"
      description="The workspace could not load its current catalog or circulation records. Your data was not changed."
      reset={reset}
    />
  );
}
