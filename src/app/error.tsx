"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        <Button type="button" onClick={reset} className="mt-5">
          <RotateCcw aria-hidden="true" className="size-4" />
          Try again
        </Button>
      </section>
    </main>
  );
}
