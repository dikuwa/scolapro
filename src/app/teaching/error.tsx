"use client";

import { Button } from "@/components/ui/button";

export default function TeachingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Teaching could not load</h2>
      <p className="scolapro-section-description">
        The teaching workspace could not load your allocations or the connected plan. Your data was not changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">
        Try again
      </Button>
    </section>
  );
}
