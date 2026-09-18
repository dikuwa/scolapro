"use client";

import { useActionState, useEffect } from "react";
import { CheckCircle2, Download, Eye, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reviewProfessionalFileSubmission, type ProfessionalFileReviewActionState } from "@/features/teaching/server/professional-file-review-actions";
import type { ProfessionalFileReviewDetail as Detail } from "@/features/teaching/server/professional-file-review";

const initialState: ProfessionalFileReviewActionState = { success: false, message: "" };

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProfessionalFileReviewDetail({ data }: { data: Detail }) {
  const [state, action, pending] = useActionState(reviewProfessionalFileSubmission, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="scolapro-section-title">{data.documentTitle}</h2>
            <p className="scolapro-section-description">
              Teacher-owned document submitted for {data.subjectName} review. Review metadata does not alter the file.
            </p>
          </div>
          <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.64rem] font-medium capitalize text-brand-strong">
            {data.status}
          </span>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Teacher</dt><dd className="mt-0.5 text-sm font-medium">{data.teacherName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Subject</dt><dd className="mt-0.5 text-sm font-medium">{data.subjectName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">File</dt><dd className="mt-0.5 break-words text-sm font-medium">{data.originalFilename}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Size</dt><dd className="mt-0.5 text-sm font-medium">{bytes(data.fileSize)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="mt-0.5 text-sm font-medium">{data.categoryLabel || "Uncategorised"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Submitted</dt><dd className="mt-0.5 text-sm font-medium">{new Date(data.submittedAt).toLocaleString("en-NA")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Last review</dt><dd className="mt-0.5 text-sm font-medium">{data.reviewedAt ? new Date(data.reviewedAt).toLocaleString("en-NA") : "Not reviewed yet"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={data.viewHref} target="_blank" rel="noopener noreferrer" className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
            <Eye className="size-3.5" aria-hidden="true" /> View submitted file
          </a>
          <a href={data.downloadHref} className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
            <Download className="size-3.5" aria-hidden="true" /> Download
          </a>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Review history</h2>
        <p className="scolapro-section-description">Append-only submit, return, review and resubmit provenance.</p>
        <ol className="mt-4 space-y-2">
          {data.events.map((event) => (
            <li key={event.id} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="font-medium capitalize">{event.eventKind}</span>
                <span className="text-muted-foreground">{event.actorRole.replaceAll("_", " ")}</span>
                <span className="text-muted-foreground">{new Date(event.occurredAt).toLocaleString("en-NA")}</span>
              </div>
              {event.comment ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{event.comment}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">HOD feedback</h2>
        {data.status === "submitted" ? (
          <form action={action} className="mt-3 space-y-4">
            <input type="hidden" name="submissionId" value={data.id} />
            <div>
              <label htmlFor="professional-review-comment" className="text-xs font-medium">Feedback / comment</label>
              <textarea
                id="professional-review-comment"
                name="comment"
                rows={4}
                maxLength={2000}
                className="mt-1.5 min-h-[96px] w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="submit" name="action" value="reviewed" variant="success" loading={pending}>
                <CheckCircle2 className="size-4" aria-hidden="true" /> Mark reviewed
              </Button>
              <Button type="submit" name="action" value="returned" variant="danger" loading={pending}>
                <Undo2 className="size-4" aria-hidden="true" /> Return with feedback
              </Button>
            </div>
            {state.message ? <p aria-live="polite" className="text-xs">{state.message}</p> : null}
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            This submission is {data.status}. Historical feedback remains visible and cannot be rewritten.
          </p>
        )}
      </section>
    </div>
  );
}
