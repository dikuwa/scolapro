"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteErrorState({
  title,
  description,
  reset,
  retryLabel = "Try again",
  reference,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  description: string;
  reset: () => void;
  retryLabel?: string;
  reference?: string | null;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <main className="grid min-h-[calc(100dvh-5rem)] place-items-center bg-background px-4 py-8 sm:px-6">
      <section className="w-full max-w-lg rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 text-left shadow-[var(--shadow-sm)] sm:p-6">
        <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-danger-soft text-[color:var(--danger)]">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1 className="scolapro-page-title mt-4 text-xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {reference ? <p className="mt-3 text-[0.68rem] text-muted-foreground">Reference: {reference}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="neutral" onClick={reset}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {retryLabel}
          </Button>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-surface-muted"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
