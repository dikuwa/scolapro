import Link from "next/link";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewQueueRow } from "@/features/teaching/server/review-queries";

const statusTone: Record<string, string> = {
  submitted: "bg-brand-soft text-brand-strong",
  reviewed: "bg-success-soft text-[color:var(--success)]",
  returned: "bg-warning-soft text-[color:var(--warning)]",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.64rem] font-medium capitalize",
        statusTone[status] ?? "bg-surface-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function subjectLine(row: ReviewQueueRow) {
  return [row.subjectLabel, row.gradeLabel, row.classLabel].filter(Boolean).join(" · ");
}

function openLabel(row: ReviewQueueRow) {
  return `Open review for ${[row.teacherName, row.subjectLabel].filter(Boolean).join(" ") || "submission"}`;
}

/**
 * Submission queue for reviewers.
 *
 * Below `md` the queue is a card list so a 390px viewport never scrolls
 * horizontally and long subject/teacher names can wrap. From `md` upward the
 * same rows are presented as a table. Both presentations carry the same
 * information and the same open-review action.
 */
export function ReviewQueue({ rows }: { rows: ReviewQueueRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface px-5 py-10 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground">
          <ClipboardCheck className="size-5" />
        </span>
        <h2 className="mt-3 text-sm font-semibold text-foreground">No submissions awaiting review</h2>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
          Submissions appear here once a teacher submits lesson preparation that falls inside your current review responsibility.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="scolapro-record-title break-words">{row.teacherName ?? "Teacher not recorded"}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground break-words">{subjectLine(row) || "Subject not recorded"}</p>
              </div>
              <StatusBadge status={row.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Week / scope</dt>
                <dd className="mt-0.5 break-words font-medium text-foreground">{row.scopeLabel}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Prepared / missing</dt>
                <dd className="mt-0.5 font-medium text-foreground">{row.preparedCount} / {row.missingCount}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Submission state</dt>
                <dd className="mt-0.5 font-medium capitalize text-foreground">{row.status}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Submitted</dt>
                <dd className="mt-0.5 font-medium text-foreground">{row.submittedOn ?? "Not recorded"}</dd>
              </div>
            </dl>
            <Link
              href={`/teaching/reviews/${row.id}`}
              aria-label={openLabel(row)}
              className="scolapro-cta mt-4 inline-flex min-h-10 w-full items-center justify-center gap-1.5 border border-border-subtle bg-surface-muted px-3 text-sm font-medium text-foreground hover:bg-surface-subtle"
            >
              Open review
              <ArrowUpRight className="scolapro-cta-icon size-3.5" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface md:block">
        <table className="w-full table-fixed text-left">
          <caption className="sr-only">Preparation submissions awaiting review</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-surface-muted">
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">Teacher</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">Subject · grade · class</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">Week / scope</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">Prepared</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">Missing</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">Submission state</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">Submitted</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-surface-muted/60">
                <td className="break-words px-4 py-3 text-sm font-medium text-foreground">{row.teacherName ?? "Not recorded"}</td>
                <td className="break-words px-4 py-3 text-sm text-muted-foreground">{subjectLine(row) || "Not recorded"}</td>
                <td className="break-words px-4 py-3 text-sm text-muted-foreground">{row.scopeLabel}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{row.preparedCount}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{row.missingCount}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{row.submittedOn ?? "Not recorded"}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/teaching/reviews/${row.id}`}
                    aria-label={openLabel(row)}
                    className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-muted"
                  >
                    Open
                    <ArrowUpRight className="scolapro-cta-icon size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}