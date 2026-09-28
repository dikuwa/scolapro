"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function CrcCustodyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState title="CRC custody could not load" description="The confidential custody workspace could not be loaded. No custody record, document or lifecycle state was changed." reset={reset} />;
}
