"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function SportsHousesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Sports / Houses could not load" description="House configuration and year-scoped allocations could not be loaded. No house, age group or assignment was changed." reset={reset} />;
}
