"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { reviewAbsenceNotice, reasonLabels, type AbsenceActionState } from "@/features/parents/server/absence-actions";
import type { AbsenceNoticeSummary } from "@/features/parents/server/absence-queries";

const initialState: AbsenceActionState = {};

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    submitted: "bg-brand-soft text-brand-strong",
    under_review: "bg-warning-soft text-[color:var(--warning)]",
    accepted: "bg-success-soft text-[color:var(--success)]",
    returned: "bg-info-soft text-[color:var(--info)]",
    closed: "bg-surface-muted text-muted-foreground",
  };
  return styles[status] ?? "bg-surface-muted text-muted-foreground";
}

function ReviewActions({ notice }: { notice: AbsenceNoticeSummary }) {
  const [state, action, pending] = useActionState(reviewAbsenceNotice, initialState);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  if (notice.status === "accepted" || notice.status === "closed") return null;

  return (
    <div className="mt-3 space-y-2">
      <label className="text-xs font-medium" htmlFor={`review-note-${notice.id}`}>Review note</label>
      <input id={`review-note-${notice.id}`} name="reviewNote" value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note to parent" className="w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-xs outline-none" />
      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="noticeId" value={notice.id} />
          <input type="hidden" name="status" value="accepted" />
          <input type="hidden" name="reviewNote" value={note} />
          <button type="submit" disabled={pending} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--success)] disabled:opacity-60">
            {pending ? <Spinner className="size-3" /> : <CheckCircle2 className="size-3.5" />}
            Accept
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="noticeId" value={notice.id} />
          <input type="hidden" name="status" value="returned" />
          <input type="hidden" name="reviewNote" value={note} />
          <button type="submit" disabled={pending} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-warning-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--warning)] disabled:opacity-60">
            <RotateCcw className="size-3.5" />
            Return
          </button>
        </form>
      </div>
    </div>
  );
}

export function AbsenceReviewList({ notices }: { notices: AbsenceNoticeSummary[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = notices.filter((n) => {
    const needle = query.trim().toLowerCase();
    const matchSearch = !needle || `${n.learnerName} ${n.reasonCategory} ${n.message ?? ""}`.toLowerCase().includes(needle);
    const matchStatus = statusFilter === "all" || n.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-[var(--radius-md)] bg-surface-muted/55 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <label className="scolapro-control-surface flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3">
          <Search className="size-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by learner, reason…"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />
          {query ? <button type="button" onClick={() => setQuery("")} className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}
        </label>
        <div className="flex gap-1 rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]">
          {["all", "submitted", "under_review", "accepted", "returned"].map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium transition ${statusFilter === s ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="scolapro-section-title">Absence notices</h2>
          <p className="scolapro-section-description">Parent-submitted absence documentation. Accepting does not automatically rewrite the official attendance register.</p>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-border-subtle">
            {filtered.map((notice) => (
              <div key={notice.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="scolapro-record-title">{notice.learnerName}</p>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                      {notice.absenceFrom === notice.absenceTo
                        ? new Date(`${notice.absenceFrom}T12:00:00`).toLocaleDateString()
                        : `${new Date(`${notice.absenceFrom}T12:00:00`).toLocaleDateString()} – ${new Date(`${notice.absenceTo}T12:00:00`).toLocaleDateString()}`}
                      {" · "}
                      <span className="capitalize">{reasonLabels[notice.reasonCategory] ?? notice.reasonCategory}</span>
                    </p>
                    {notice.message ? <p className="mt-1 text-xs text-muted-foreground">{notice.message}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {notice.attachmentCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-info-soft px-2 py-1 text-[0.64rem] font-medium text-[color:var(--info)]">
                        <FileText className="size-3" />{notice.attachmentCount} file{notice.attachmentCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium capitalize ${statusBadge(notice.status)}`}>{notice.status.replace("_", " ")}</span>
                  </div>
                </div>
                {notice.reviewNote ? (
                  <p className="mt-2 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-[0.68rem] text-muted-foreground">
                    Review: {notice.reviewNote}
                  </p>
                ) : null}
                <ReviewActions notice={notice} />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground">
              <FileText className="size-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">No absence notices found</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              {notices.length ? "No notices match your current filters." : "Parents will submit absence documentation through the parent portal."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
