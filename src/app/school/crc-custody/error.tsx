"use client";

import { Button } from "@/components/ui/button";

export default function CrcCustodyError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">CRC custody could not load</h2>
      <p className="scolapro-section-description">
        The confidential custody workspace could not be loaded. No custody record, document or lifecycle state was changed.
      </p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">
        Try again
      </Button>
    </section>
  );
}
