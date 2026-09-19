"use client";

import { Button } from "@/components/ui/button";

export default function LearnersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Learner directory could not load</h2>
      <p className="scolapro-section-description">
        Current learner identities and enrolments could not be loaded. No learner or enrolment record was changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">Try again</Button>
    </section>
  );
}
