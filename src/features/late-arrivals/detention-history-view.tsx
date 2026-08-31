"use client";

import { useMemo, useState } from "react";
import { ChevronRight, History, RotateCcw, Search, X } from "lucide-react";
import type { DetentionHistoryItem } from "@/features/late-arrivals/server/detention-history-queries";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-warning-soft text-[color:var(--warning)]",
    carried_forward: "bg-danger-soft text-[color:var(--danger)]",
    completed: "bg-success-soft text-[color:var(--success)]",
    waived: "bg-surface-muted text-muted-foreground",
  };
  return styles[status] ?? "bg-surface-muted text-muted-foreground";
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
  openCount: number;
};

export function DetentionHistoryView({ items }: { items: DetentionHistoryItem[] }) {
  const [query, setQuery] = useState("");
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
        openCount: 0,
      };
      current.items.push(item);
      if (item.status === "pending" || item.status === "carried_forward") current.openCount += 1;
      byLearner.set(item.learnerId, current);
    }
    return [...byLearner.values()]
      .map((group) => ({ ...group, items: [...group.items].sort((a, b) => b.dueOn.localeCompare(a.dueOn)) }))
      .sort((a, b) => a.learnerName.localeCompare(b.learnerName));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return grouped;
    return grouped.filter((group) => `${group.learnerName} ${group.admissionNumber ?? ""} ${group.gradeName ?? ""} ${group.className ?? ""}`.toLocaleLowerCase().includes(needle));
  }, [grouped, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-md)] bg-surface-muted/55 p-3">
        <label className="scolapro-control-surface flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner by name, admission number, grade or class…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface hover:text-foreground"><X className="size-3.5" /></button> : null}
        </label>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
          <div><h2 className="scolapro-section-title">Detention history</h2><p className="scolapro-section-description">Only learners with a detention obligation appear here. Expand one learner to review each obligation and its real dates.</p></div>
          <span className="shrink-0 text-xs text-muted-foreground">{filtered.length} learner{filtered.length === 1 ? "" : "s"}</span>
        </div>

        {filtered.length ? <div>{filtered.map((group) => {
          const expanded = expandedLearnerId === group.learnerId;
          return (
            <div key={group.learnerId} className="border-b border-border-subtle last:border-b-0">
              <button type="button" onClick={() => setExpandedLearnerId((current) => current === group.learnerId ? null : group.learnerId)} aria-expanded={expanded} aria-controls={`detention-history-${group.learnerId}`} className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-surface-muted/65 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-soft)] sm:px-5">
                <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${expanded ? "rotate-90 text-brand-strong" : ""}`} aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="scolapro-record-title block truncate">{group.learnerName}</span><span className="mt-0.5 block truncate text-[0.65rem] text-muted-foreground">{group.admissionNumber ?? "No admission number"} · {group.gradeName ?? "—"} · {group.className ?? "—"}</span></span>
                <span className={`shrink-0 rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${group.openCount ? "bg-warning-soft text-[color:var(--warning)]" : "bg-surface-muted text-muted-foreground"}`}>{group.openCount ? `${group.openCount} open` : `${group.items.length} detention${group.items.length === 1 ? "" : "s"}`}</span>
              </button>

              {expanded ? <div id={`detention-history-${group.learnerId}`} className="border-t border-border-subtle bg-surface-muted/35 px-4 py-3 sm:px-5">
                <div className="space-y-2">{group.items.map((item) => (
                  <article key={item.id} className="rounded-[var(--radius-sm)] bg-surface px-3 py-3 shadow-[var(--shadow-xs)]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Due {formatDate(item.dueOn)}</p>
                        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">Triggered {formatDate(item.triggeredOn)}{item.originalDueOn !== item.dueOn ? ` · originally due ${formatDate(item.originalDueOn)}` : ""}</p>
                      </div>
                      <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium capitalize ${statusBadge(item.status)}`}>{item.status.replaceAll("_", " ")}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-[0.68rem] text-muted-foreground sm:grid-cols-2">
                      <p>Supervisor: <span className="font-medium text-foreground">{item.assignedStaffName ?? "Not assigned"}</span></p>
                      <p>{item.completedAt ? `Completed ${formatDate(item.completedAt)}` : "Not completed"}</p>
                      {item.rolloverCount > 0 ? <p className="inline-flex items-center gap-1 text-[color:var(--danger)]"><RotateCcw className="size-3" />Carried forward {item.rolloverCount} time{item.rolloverCount === 1 ? "" : "s"}</p> : null}
                      {item.detentionSessionCount > 0 ? <p>{item.detentionSessionCount} linked session{item.detentionSessionCount === 1 ? "" : "s"}{item.latestSessionDate ? ` · latest ${formatDate(item.latestSessionDate)}` : ""}</p> : null}
                    </div>
                    {item.resolutionNote ? <p className="mt-2 text-[0.68rem] italic text-muted-foreground">{item.resolutionNote}</p> : null}
                  </article>
                ))}</div>
              </div> : null}
            </div>
          );
        })}</div> : <div className="px-5 py-10 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><History className="size-5" /></span><h3 className="mt-3 text-sm font-semibold">No detention records</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{items.length ? "No learners match this search." : "No detention obligations have been recorded for this school."}</p></div>}
      </section>
    </div>
  );
}
