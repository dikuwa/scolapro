"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 text-left shadow-[var(--shadow-sm)]">
        <span className="grid size-10 place-items-center rounded-xl bg-danger-soft text-[color:var(--danger)]">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-[-0.03em]">Something did not load correctly</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your work has not been intentionally discarded. Try loading this view again. If the problem continues, the incident can be reviewed from application monitoring.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white transition duration-200 hover:bg-brand-strong"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Try again
        </button>
      </section>
    </main>
  );
}
