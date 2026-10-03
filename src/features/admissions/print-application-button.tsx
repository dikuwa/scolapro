"use client";

import { Printer } from "lucide-react";

export function PrintApplicationButton() {
  return (
    <button type="button" onClick={() => window.print()} className="print:hidden inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white">
      <Printer className="size-4" /> Print application
    </button>
  );
}
