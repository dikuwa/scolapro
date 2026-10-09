"use client";

import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";

export type AttendanceSortDirection = "asc" | "desc";

export function AttendanceSortControl({ sort, onChange }: { sort: AttendanceSortDirection; onChange: (sort: AttendanceSortDirection) => void }) {
  return (
    <button
      type="button"
      aria-label={`Learner name order: ${sort === "asc" ? "A to Z" : "Z to A"}. Activate to reverse.`}
      onClick={() => onChange(sort === "asc" ? "desc" : "asc")}
      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] bg-surface px-2.5 text-[0.7rem] font-medium text-brand-strong shadow-[var(--shadow-xs)] outline-none transition hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/35"
    >
      {sort === "asc" ? <ArrowDownAZ className="size-3.5" aria-hidden="true" /> : <ArrowUpAZ className="size-3.5" aria-hidden="true" />}
      {sort === "asc" ? "A–Z" : "Z–A"}
    </button>
  );
}
