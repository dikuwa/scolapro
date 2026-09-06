"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";

export default function LearnerCumulativeRecordError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Learner cumulative record route failed", {
    message: error.message,
    digest: error.digest,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl py-8 sm:py-12">
        <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
          <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-danger-soft text-[color:var(--danger)]">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <h1 className="scolapro-page-title mt-4 text-xl">Cumulative record could not be loaded</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            ScolaPro could not complete one of the governed cumulative-record queries. No record has been changed. Retry the page, or return to the learner profile if the problem continues.
          </p>
          {error.digest ? <p className="mt-3 text-[0.68rem] text-muted-foreground">Reference: {error.digest}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={reset} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong">
              <RefreshCw className="size-3.5" aria-hidden="true" /> Retry
            </button>
            <Link href="/learners" className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted">
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to learners
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
