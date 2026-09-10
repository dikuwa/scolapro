"use client";

import { Button } from "@/components/ui/button";

export default function ConductError({ reset }: { reset: () => void }) {
  return (
    <main className="bg-background px-4 py-6 sm:px-6 lg:px-8">
      <section className="scolapro-content-width rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Conduct unavailable</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">We could not load your school’s conduct records. Check your connection and try again.</p>
        <Button type="button" variant="soft" className="mt-4" onClick={reset}>Try again</Button>
      </section>
    </main>
  );
}
