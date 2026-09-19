"use client";

import { Button } from "@/components/ui/button";

export default function AbsenceReviewsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Absence reviews could not load</h2>
      <p className="scolapro-section-description">
        The daily register and subject-period review data could not be loaded. No attendance or guardian notice was changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">Try again</Button>
    </section>
  );
}
