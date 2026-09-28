"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function FinanceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Finance workspace could not load" description="Payment settings and finance records could not be loaded. No payment, allocation, invoice or banking setting was changed." reset={reset} />;
}
