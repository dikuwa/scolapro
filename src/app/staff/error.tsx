"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function StaffError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Staff directory could not load" description="Staff identities and placements could not be loaded. No staff identity, placement or import record was changed." reset={reset} />;
}
