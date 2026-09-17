"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useActionState } from "react";
import { reviewSubmission } from "@/features/teaching/server/review-actions";

interface ReviewSubmissionDetail {
  id: string;
  scopeKind: string;
  termLabel: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  status: string;
  submittedBy: string;
  submittedAt: string;
  academicYear: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  items: Array<{
    lessonPreparationId: string;
    preparationStatusSnapshot: string;
    subjectLabel: string;
    registerClassLabel: string;
    teacherName: string;
    plannedOn: string | null;
  }>;
  events: Array<{
    id: string;
    eventKind: string;
    actorRoleSnapshot: string;
    comment: string | null;
    occurredAt: string;
    metadata: Record<string, unknown>;
  }>;
}

export function ReviewDetail({ data }: { data: ReviewSubmissionDetail }) {
  const [state, action, pending] = useActionState(reviewSubmission, { message: "", success: false });

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5">
        <h2 className="scolapro-section-title">Submission Details</h2>
        <p className="scolapro-section-description">Review the preparation items below and take action.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Scope</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {data.scopeKind === "week"
                ? `Week ${data.weekStart ?? ""} – ${data.weekEnd ?? ""}`
                : data.scopeKind === "term"
                  ? data.termLabel ?? "Term"
                  : "Selected preparations"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Submitted by</p>
            <p className="mt-1 text-sm font-medium text-foreground">{data.submittedBy}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Submitted on</p>
            <p className="mt-1 text-sm font-medium text-foreground">{new Date(data.submittedAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <p className={cn("mt-1 text-sm font-medium", data.status === "submitted" ? "text-brand-strong" : "text-muted-foreground")}>
              {data.status}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5">
        <h2 className="scolapro-section-title">Preparation Items ({data.items.length})</h2>
        <p className="scolapro-section-description">Items grouped in this submission.</p>
        <div className="mt-4 space-y-3">
          {data.items.map((item) => (
            <div key={item.lessonPreparationId} className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border-subtle bg-surface-subtle px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{item.subjectLabel}</p>
                <p className="text-xs text-muted-foreground">{item.registerClassLabel} · {item.teacherName}</p>
              </div>
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                item.preparationStatusSnapshot === "submitted" || item.preparationStatusSnapshot === "reviewed"
                  ? "bg-brand-soft text-brand-strong"
                  : "bg-surface-muted text-muted-foreground",
              )}>
                {item.preparationStatusSnapshot}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5">
        <h2 className="scolapro-section-title">Review History</h2>
        <div className="mt-4 space-y-3">
          {data.events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-subtle px-4 py-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground capitalize">{event.eventKind}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">{event.actorRoleSnapshot}</span>
                </div>
                {event.comment && <p className="mt-1 text-sm text-foreground">{event.comment}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {data.events.length === 0 && <p className="text-sm text-muted-foreground">No review history yet.</p>}
        </div>
      </div>

      {data.status === "submitted" && (
        <form action={action} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5">
          <h2 className="scolapro-section-title">Take Action</h2>
          <input type="hidden" name="submissionId" value={data.id} />
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground">Comment</label>
              <textarea name="comment" rows={3} className="mt-1.5 min-h-[80px] w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" name="action" value="reviewed" variant="success" disabled={pending} className="min-h-10">
                {pending ? <Spinner className="size-4 shrink-0 text-current" /> : null}
                Approve
              </Button>
              <Button type="submit" name="action" value="returned" variant="danger" disabled={pending} className="min-h-10">
                {pending ? <Spinner className="size-4 shrink-0 text-current" /> : null}
                Return for Revision
              </Button>
            </div>
            {state.message && (
              <p className={`text-xs ${state.success ? "text-success" : "text-danger"}`}>{state.message}</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
