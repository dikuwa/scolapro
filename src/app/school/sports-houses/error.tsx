"use client";

import { Button } from "@/components/ui/button";

export default function SportsHousesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Sports / Houses could not load</h2>
      <p className="scolapro-section-description">
        House configuration and year-scoped allocations could not be loaded. No house, age group or assignment was changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">Try again</Button>
    </section>
  );
}
