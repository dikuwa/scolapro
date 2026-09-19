"use client";

import { Button } from "@/components/ui/button";

export default function ContributionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Voluntary contributions could not load</h2>
      <p className="scolapro-section-description">
        Contribution campaigns and records could not be loaded. No contribution or campaign state was changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">Try again</Button>
    </section>
  );
}
