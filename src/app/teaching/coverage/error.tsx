"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TeachingCoverageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
      <Link
        href="/teaching"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Teaching
      </Link>
      <h2 className="scolapro-section-title mt-3">Coverage could not load</h2>
      <p className="scolapro-section-description">
        The coverage workspace could not load your allocations or schedule items.
        Your data was not changed.
      </p>
      <Button type="button" variant="neutral" onClick={() => reset()} className="mt-4">
        Try again
      </Button>
    </section>
  );
}
