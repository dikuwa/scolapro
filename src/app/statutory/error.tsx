"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function StatutoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="Statutory reporting unavailable" description="The governed statutory lifecycle could not be loaded. No reporting or certification state was changed." reset={reset} />;
}
