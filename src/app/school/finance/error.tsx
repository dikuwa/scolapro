"use client";

import { Button } from "@/components/ui/button";

export default function FinanceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Finance workspace could not load</h2>
      <p className="scolapro-section-description">
        Payment settings and finance records could not be loaded. No payment, allocation, invoice or banking setting was changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">Try again</Button>
    </section>
  );
}
