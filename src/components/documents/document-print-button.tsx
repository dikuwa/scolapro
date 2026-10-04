"use client";

import { Printer } from "lucide-react";

export function DocumentPrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted"
    >
      <Printer aria-hidden="true" className="size-3.5" />
      {label}
    </button>
  );
}
