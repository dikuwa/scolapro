import Link from "next/link";
import { ArrowUpRight, FileCheck2 } from "lucide-react";
import type { ProfessionalFileReviewQueueRow } from "@/features/teaching/server/professional-file-review";

export function ProfessionalFileReviewQueue({ rows }: { rows: ProfessionalFileReviewQueueRow[] }) {
  return (
    <section className="mt-6 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]">
          <FileCheck2 className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="scolapro-section-title">Professional-file review</h2>
          <p className="scolapro-section-description">
            Only documents explicitly submitted by teachers inside your current subject responsibility appear here.
          </p>
        </div>
      </div>
      {rows.length ? (
        <ul className="mt-4 divide-y divide-border-subtle">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="scolapro-record-title break-words">{row.documentTitle}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {row.teacherName} · {row.subjectName} · submitted {new Date(row.submittedAt).toLocaleDateString("en-NA")}
                </p>
              </div>
              <Link
                href={`/teaching/reviews/professional-files/${row.id}`}
                className="scolapro-cta inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-semibold hover:bg-surface-muted"
              >
                Open review <ArrowUpRight className="scolapro-cta-icon size-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 text-sm text-muted-foreground">
          No professional documents are awaiting review in your current responsibility scope.
        </p>
      )}
    </section>
  );
}
