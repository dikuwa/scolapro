"use client";

import { AlertTriangle } from "lucide-react";

export default function DneaReadinessError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="mx-auto max-w-2xl py-12"><div className="rounded-[var(--radius-md)] bg-surface p-6 text-center shadow-[var(--shadow-xs)]"><AlertTriangle className="mx-auto size-5 text-destructive" /><h1 className="mt-3 text-lg font-semibold">DNEA readiness could not be loaded</h1><p className="mt-2 text-sm text-muted-foreground">The readiness review is temporarily unavailable. No examination data was changed.</p><button className="mt-4 inline-flex min-h-9 items-center justify-center rounded-[var(--radius-sm)] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" type="button" onClick={reset}>Try again</button></div></section>;
}
