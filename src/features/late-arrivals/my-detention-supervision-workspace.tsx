"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, History, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import {
  completeMyDetentionAssignment,
  type CompleteMyDetentionState,
  type MyDetentionSupervisionPage,
} from "@/features/late-arrivals/server/my-supervision";

const initialState: CompleteMyDetentionState = {};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AssignmentCard({ item }: { item: MyDetentionSupervisionPage["items"][number] }) {
  const [state, action, pending] = useActionState(completeMyDetentionAssignment, initialState);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <article className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-4 shadow-[var(--shadow-xs)] transition duration-[var(--motion-fast)] hover:border-border sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{item.learnerName}</h2>
            <span className="rounded-full bg-surface-muted px-2 py-1 text-[0.65rem] font-medium text-muted-foreground">{statusLabel(item.status)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(item.dueOn)} · {item.qualifyingLateCount} qualifying late arrivals</p>
        </div>
        <span className="shrink-0 text-[0.68rem] text-muted-foreground">Academic year {item.academicYear}</span>
      </div>

      <dl className="mt-4 grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted/65 p-3 text-xs sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Triggered</dt><dd className="mt-0.5 font-medium text-foreground">{formatDate(item.triggeredOn)}</dd></div>
        <div><dt className="text-muted-foreground">Original due date</dt><dd className="mt-0.5 font-medium text-foreground">{formatDate(item.originalDueOn)}</dd></div>
        <div><dt className="text-muted-foreground">Carry-forwards</dt><dd className="mt-0.5 font-medium text-foreground">{item.rolloverCount}</dd></div>
      </dl>

      {item.resolutionNote ? <p className="mt-3 rounded-[var(--radius-sm)] border border-border-subtle px-3 py-2 text-xs text-muted-foreground">{item.resolutionNote}</p> : null}

      {item.canComplete ? (
        <div className="mt-4 border-t border-border-subtle pt-4">
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white transition duration-[var(--motion-fast)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Mark completed
            </button>
          ) : (
            <form action={action} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/45 p-3">
              <input type="hidden" name="obligationId" value={item.obligationId} />
              <label className="block text-xs font-medium text-foreground">Completion note <span className="font-normal text-muted-foreground">(optional)</span>
                <textarea name="note" rows={2} maxLength={1000} placeholder="Add a short note if useful" className="mt-1.5 w-full resize-y rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm outline-none transition focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">Confirm only after this learner has completed the assigned detention. This action does not provide a waiver option.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
                  {pending ? <Spinner className="size-4 text-white" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                  {pending ? "Completing…" : "Confirm completed"}
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="min-h-10 rounded-[var(--radius-sm)] border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50">Cancel</button>
              </div>
            </form>
          )}
        </div>
      ) : item.status === "pending" || item.status === "carried_forward" ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/55 px-3 py-2.5 text-xs text-muted-foreground">
          This assignment is retained for your history, but this account cannot complete it under the current dated school-placement rules.
        </div>
      ) : item.completedAt ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-brand" aria-hidden="true" /> Completed {new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.completedAt))}</p>
      ) : null}
    </article>
  );
}

export function MyDetentionSupervisionWorkspace({ data }: { data: MyDetentionSupervisionPage }) {
  const pageCount = Math.max(Math.ceil(data.totalCount / data.pageSize), 1);
  const previousHref = `/my-detention-supervision?view=${data.includeResolved ? "history" : "current"}&page=${Math.max(data.page - 1, 1)}`;
  const nextHref = `/my-detention-supervision?view=${data.includeResolved ? "history" : "current"}&page=${Math.min(data.page + 1, pageCount)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1">
          <Link href="/my-detention-supervision?view=current&page=1" aria-current={!data.includeResolved ? "page" : undefined} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-xs)] px-3 text-xs font-semibold transition ${!data.includeResolved ? "bg-surface-elevated text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}><Clock3 className="size-3.5" aria-hidden="true" /> Current</Link>
          <Link href="/my-detention-supervision?view=history&page=1" aria-current={data.includeResolved ? "page" : undefined} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-xs)] px-3 text-xs font-semibold transition ${data.includeResolved ? "bg-surface-elevated text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}><History className="size-3.5" aria-hidden="true" /> History</Link>
        </div>
        <p className="text-xs text-muted-foreground">{data.totalCount} assignment{data.totalCount === 1 ? "" : "s"}</p>
      </div>

      {data.items.length ? (
        <div className="space-y-3">{data.items.map((item) => <AssignmentCard key={item.obligationId} item={item} />)}</div>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-8 text-center shadow-[var(--shadow-xs)]">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-brand-soft text-brand"><UserCheck className="size-5" aria-hidden="true" /></span>
          <h2 className="mt-3 text-sm font-semibold">{data.includeResolved ? "No detention history yet" : "No current detention assignments"}</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{data.includeResolved ? "Completed or otherwise resolved assignments will appear here." : "When you are assigned learners for detention, only your own assignments will appear here."}</p>
        </div>
      )}

      {data.totalCount > data.pageSize ? (
        <nav aria-label="Detention supervision pages" className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface px-3 py-2 shadow-[var(--shadow-xs)]">
          <Link href={previousHref} aria-disabled={data.page <= 1} className={`inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] px-3 text-xs font-medium ${data.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-muted"}`}><ChevronLeft className="size-4" aria-hidden="true" /> Previous</Link>
          <span className="text-xs text-muted-foreground">Page {data.page} of {pageCount}</span>
          <Link href={nextHref} aria-disabled={data.page >= pageCount} className={`inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] px-3 text-xs font-medium ${data.page >= pageCount ? "pointer-events-none opacity-40" : "hover:bg-surface-muted"}`}>Next <ChevronRight className="size-4" aria-hidden="true" /></Link>
        </nav>
      ) : null}
    </div>
  );
}
