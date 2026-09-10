"use client";

import { Button } from "@/components/ui/button";

export default function LibraryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <h2 className="scolapro-section-title">Library / Textbooks could not load</h2>
      <p className="scolapro-section-description">The workspace could not load its current catalog or circulation records. Your data was not changed.</p>
      <Button type="button" variant="neutral" onClick={reset} className="mt-4">Try again</Button>
    </section>
  );
}
