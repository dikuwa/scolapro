"use client";

import { RotateCcw } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";

export default function StatutoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell>
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-xs)]">
        <h1 className="scolapro-page-title text-xl">Statutory reporting unavailable</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The governed statutory lifecycle could not be loaded. No reporting or certification state was changed.</p>
        <button type="button" onClick={reset} className="scolapro-cta mt-5 inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white"><RotateCcw className="size-4" />Try again</button>
      </section>
    </AppShell>
  );
}
