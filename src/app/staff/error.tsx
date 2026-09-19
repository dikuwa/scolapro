"use client";

import { Button } from "@/components/ui/button";

export default function StaffError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Staff directory could not load</h2>
      <p className="scolapro-section-description">
        Staff identities and placements could not be loaded. No staff identity, placement or import record was changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">Try again</Button>
    </section>
  );
}
