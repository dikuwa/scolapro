"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function TeachingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Teaching could not load" description="The teaching workspace could not load your allocations or the connected plan. Your data was not changed." reset={reset} />;
}
