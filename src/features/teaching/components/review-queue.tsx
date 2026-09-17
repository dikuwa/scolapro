"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipboardCheck, Clock, FileText, Scale } from "lucide-react";

interface ReviewQueueRow {
  id: string;
  scopeKind: string;
  termLabel: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  status: string;
  submittedBy: string;
  submittedAt: string;
  subjectLabel: string;
  teacherName: string;
  itemCount: number;
}

export function ReviewQueue({ rows }: { rows: ReviewQueueRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardCheck className="size-12 text-muted-foreground/40" />
        <p className="mt-4 text-sm text-muted-foreground">No submissions awaiting review.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-muted">
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Scope</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Subject</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Teacher</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Items</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors">
              <td className="px-4 py-3 text-sm">
                {row.scopeKind === "week"
                  ? `Week ${row.weekStart ?? ""}`
                  : row.scopeKind === "term"
                    ? row.termLabel ?? "Term"
                    : "Selected"}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-foreground">{row.subjectLabel}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{row.teacherName}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{row.itemCount}</td>
              <td className="px-4 py-3">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  row.status === "submitted" ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground",
                )}>
                  {row.status === "submitted" ? <Clock className="size-2.5" /> : <FileText className="size-2.5" />}
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {new Date(row.submittedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
