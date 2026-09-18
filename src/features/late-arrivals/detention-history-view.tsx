"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, RotateCcw, Search, X } from "lucide-react";
import type {
  DetentionHistoryItem,
  DetentionLifecycleFilter,
  DetentionObligationSummary,
} from "@/features/late-arrivals/server/detention-history-queries";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-warning-soft text-[color:var(--warning)]",
    carried_forward: "bg-danger-soft text-[color:var(--danger)]",
    completed: "bg-success-soft text-[color:var(--success)]",
    waived: "bg-surface-muted text-muted-foreground",
  };
  return styles[status] ?? "bg-surface-muted text-muted-foreground";
}

function statusLabel(status: string) {
  if (status === "pending") return "Outstanding";
  if (status === "carried_forward") return "Outstanding · carried";
  if (status === "completed") return "Completed";
  if (status === "waived") return "Waived";
  return status.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

type LearnerHistory = {
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  gradeName: string | null;
  className: string | null;
  items: DetentionHistoryItem[];
  outstandingCount: number;
  overdueCount: number;
  completedCount: number;
  missedSessionCount: number;
  currentlyEnrolled: boolean;
};

function historyHref({
  page = 1,
  query,
  lifecycle,
}: {
  page?: number;
  query: string;
  lifecycle: DetentionLifecycleFilter;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (lifecycle !== "all") params.set("lifecycle", lifecycle);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/late-arrivals/history?${suffix}` : "/late-arrivals/history";
}

function LifecycleCard({
  label,
  value,
  helper,
  filter,
  active,
  query,
}: {
  label: string;
  value: number;
  helper: string;
  filter: DetentionLifecycleFilter;
  active: boolean;
  query: string;
}) {
  return (
    <Link
      href={historyHref({ query, lifecycle: filter })}
      aria-current={active ? "page" : undefined}
      className={`min-w-0 rounded-[var(--radius-sm)] px-3 py-3 transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft ${
        active ? "bg-brand-soft text-brand-strong" : "bg-surface hover:bg-surface-muted"
      }`}
    >
      <span className="block text-[0.68rem] font-medium">{label}</span>
      <span className="mt-1 block text-lg font-semibold tabular-nums text-foreground">{value}</span>
      <span className="mt-0.5 block text-[0.64rem] leading-4 text-muted-foreground">{helper}</span>
    </Link>
  );
}

export function DetentionHistoryView({
  items,
  summary,
  query,
  lifecycle,
  page,
  pageSize,
  totalLearners,
}: {
  items: DetentionHistoryItem[];
  summary: DetentionObligationSummary;
  query: string;
  lifecycle: DetentionLifecycleFilter;
  page: number;
  pageSize: number;
  totalLearners: number;
}) {
  const [expandedLearnerId, setExpandedLearnerId] = useState<string | null>(null);

  const grouped = useMemo<LearnerHistory[]>(() => {
    const byLearner = new Map<string, LearnerHistory>();
    for (const item of items) {
      const current = byLearner.get(item.learnerId) ?? {
        learnerId: item.learnerId,
        learnerName: item.learnerName,
        admissionNumber: item.admissionNumber,
        gradeName: item.gradeName,
        className: item.className,
        items: [],
        outstandingCount: item.learnerOutstandingCount,
        overdueCount: item.learnerOverdueCount,
        completedCount: item.learnerCompletedCount,
        missedSessionCount: item.learnerMissedSessionCount,
        currentlyEnrolled: item.currentlyEnrolled,
      };
      current.items.push(item);
      byLearner.set(item.learnerId, current);
    }
    return [...byLearner.values()]
      .map((group) => ({ ...group, items: [...group.items].sort((a, b) => b.dueOn.localeCompare(a.dueOn)) }))
      .sort((a, b) => a.learnerName.localeCompare(b.learnerName));
  }, [items]);

  const pageCount = Math.max(1, Math.ceil(totalLearners / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < pageCount;
  const firstLearner = totalLearners ? (page - 1) * pageSize + 1 : 0;
  const lastLearner = totalLearners ? Math.min(page * pageSize, totalLearners) : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-md)] bg-surface-muted/55 p-3 sm:p-4" aria-label="Detention lifecycle summary">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <LifecycleCard
            label="Outstanding"
            value={summary.outstandingObligations}
            helper="Obligations still owed"
            filter="outstanding"
            active={lifecycle === "outstanding"}
            query={query}
          />
          <LifecycleCard
            label="Overdue"
            value={summary.overdueObligations}
            helper="Past due, carried or missed"
            filter="overdue"
            active={lifecycle === "overdue"}
            query={query}
          />
          <LifecycleCard
            label="Partially fulfilled"
            value={summary.partialLearners}
            helper="Learners with completed and outstanding obligations"
            filter="partial"
            active={lifecycle === "partial"}
            query={query}
          />
          <LifecycleCard
            label="Completed"
            value={summary.completedObligations}
            helper="Fulfilled obligations"
            filter="completed"
            active={lifecycle === "completed"}
            query={query}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] text-muted-foreground">
          <span>{summary.missedOutstandingObligations} outstanding obligation{summary.missedOutstandingObligations === 1 ? "" : "s"} with recorded missed detention</span>
          <span>{summary.multipleOutstandingLearners} learner{summary.multipleOutstandingLearners === 1 ? "" : "s"} with multiple outstanding obligations</span>
          {lifecycle !== "all" ? (
            <Link href={historyHref({ query, lifecycle: "all" })} className="font-medium text-brand-strong hover:underline">
              Show all
            </Link>
          ) : null}
        </div>
      </section>

      <div className="rounded-[var(--radius-md)] bg-surface-muted/55 p-3">
        <form method="get" className="flex flex-col gap-2 sm:flex-row">
          {lifecycle !== "all" ? <input type="hidden" name="lifecycle" value={lifecycle} /> : null}
          <label className="scolapro-control-surface flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input name="q" defaultValue={query} placeholder="Search learner by name, admission number, grade or class…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />
            {query ? (
              <Link
                href={historyHref({ query: "", lifecycle })}
                aria-label="Clear search"
                className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <X className="size-3.5" />
              </Link>
            ) : null}
          </label>
          <button type="submit" className="scolapro-cta min-h-10 bg-brand px-4 text-xs font-semibold text-white">Search</button>
        </form>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
          <div>
            <h2 className="scolapro-section-title">Detention obligation history</h2>
            <p className="scolapro-section-description">Filters select learners; expanding a learner keeps every obligation visible so fulfilment and missed-detention provenance remain intact.</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{totalLearners} learner{totalLearners === 1 ? "" : "s"}</span>
        </div>

        {grouped.length ? <div>{grouped.map((group) => {
          const expanded = expandedLearnerId === group.learnerId;
          return (
            <div key={group.learnerId} className="border-b border-border-subtle last:border-b-0">
              <button
                type="button"
                onClick={() => setExpandedLearnerId((current) => current === group.learnerId ? null : group.learnerId)}
                aria-expanded={expanded}
                aria-controls={`detention-history-${group.learnerId}`}
                className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-surface-muted/65 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-soft)] sm:px-5"
              >
                <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${expanded ? "rotate-90 text-brand-strong" : ""}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="scolapro-record-title block truncate">{group.learnerName}</span>
                  <span className="mt-0.5 block truncate text-[0.65rem] text-muted-foreground">
                    {group.admissionNumber ?? "No admission number"} · {group.gradeName ?? "—"} · {group.className ?? "—"} · {group.currentlyEnrolled ? "Currently enrolled" : "No longer currently enrolled"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {group.missedSessionCount > 0 ? <span className="rounded-[var(--radius-xs)] bg-danger-soft px-2 py-1 text-[0.64rem] font-semibold text-[color:var(--danger)]">Missed detention</span> : null}
                  {group.outstandingCount > 1 ? <span className="rounded-[var(--radius-xs)] bg-danger-soft px-2 py-1 text-[0.64rem] font-semibold text-[color:var(--danger)]">Multiple outstanding · {group.outstandingCount}</span> : group.outstandingCount === 1 ? <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[0.64rem] font-semibold text-[color:var(--warning)]">1 outstanding</span> : <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.64rem] font-semibold text-[color:var(--success)]">No outstanding</span>}
                </span>
              </button>

              {expanded ? <div id={`detention-history-${group.learnerId}`} className="border-t border-border-subtle bg-surface-muted/35 px-4 py-3 sm:px-5">
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-muted-foreground">
                  <span>{group.outstandingCount} outstanding</span>
                  <span>{group.overdueCount} overdue</span>
                  <span>{group.completedCount} completed</span>
                  {group.missedSessionCount > 0 ? <span>{group.missedSessionCount} missed detention attendance record{group.missedSessionCount === 1 ? "" : "s"}</span> : null}
                </div>
                <div className="space-y-2">{group.items.map((item) => (
                  <article key={item.id} className="rounded-[var(--radius-sm)] bg-surface px-3 py-3 shadow-[var(--shadow-xs)]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Due {formatDate(item.dueOn)}</p>
                        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">Triggered {formatDate(item.triggeredOn)}{item.originalDueOn !== item.dueOn ? ` · originally due ${formatDate(item.originalDueOn)}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {item.missedSessionCount > 0 && (item.status === "pending" || item.status === "carried_forward") ? (
                          <span className="rounded-[var(--radius-xs)] bg-danger-soft px-2 py-1 text-[0.64rem] font-medium text-[color:var(--danger)]">
                            Missed detention · still outstanding
                          </span>
                        ) : null}
                        <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium ${statusBadge(item.status)}`}>{statusLabel(item.status)}</span>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-1 text-[0.68rem] text-muted-foreground sm:grid-cols-2">
                      <p>Supervisor: <span className="font-medium text-foreground">{item.assignedStaffName ?? "Not assigned"}</span></p>
                      <p>{item.completedAt ? `Completed ${formatDate(item.completedAt)}` : "Not completed"}</p>
                      {item.rolloverCount > 0 ? <p className="inline-flex items-center gap-1 text-[color:var(--danger)]"><RotateCcw className="size-3" />Carried forward {item.rolloverCount} time{item.rolloverCount === 1 ? "" : "s"}</p> : null}
                      {item.detentionSessionCount > 0 ? <p>{item.detentionSessionCount} linked session{item.detentionSessionCount === 1 ? "" : "s"}{item.latestSessionDate ? ` · latest ${formatDate(item.latestSessionDate)}` : ""}</p> : null}
                    </div>
                    {item.missedSessionCount > 0 ? <p className="mt-2 text-[0.68rem] text-[color:var(--danger)]">{item.missedSessionCount} recorded non-attendance outcome{item.missedSessionCount === 1 ? "" : "s"} for this obligation.</p> : null}
                    {item.resolutionNote ? <p className="mt-2 text-[0.68rem] italic text-muted-foreground">{item.resolutionNote}</p> : null}
                  </article>
                ))}</div>
              </div> : null}
            </div>
          );
        })}</div> : <div className="px-5 py-10 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><History className="size-5" /></span><h3 className="mt-3 text-sm font-semibold">No detention records</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{query || lifecycle !== "all" ? "No learners match the current search and lifecycle filter." : "No detention obligations have been recorded for this school."}</p></div>}

        {totalLearners > pageSize ? (
          <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span>Showing learners {firstLearner}–{lastLearner} of {totalLearners}</span>
            <div className="flex items-center gap-2">
              {hasPrevious ? <Link href={historyHref({ page: page - 1, query, lifecycle })} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 font-medium text-foreground hover:bg-surface-muted/80"><ChevronLeft className="size-3.5" />Previous</Link> : <span className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted/45 px-2.5 opacity-45"><ChevronLeft className="size-3.5" />Previous</span>}
              <span>Page {page} of {pageCount}</span>
              {hasNext ? <Link href={historyHref({ page: page + 1, query, lifecycle })} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 font-medium text-foreground hover:bg-surface-muted/80">Next<ChevronRight className="size-3.5" /></Link> : <span className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted/45 px-2.5 opacity-45">Next<ChevronRight className="size-3.5" /></span>}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
