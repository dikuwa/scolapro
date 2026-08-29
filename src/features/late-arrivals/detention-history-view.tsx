"use client";

import { useMemo, useState } from "react";
import { History, Search, ShieldCheck, X } from "lucide-react";
import type { DetentionHistoryItem } from "@/features/late-arrivals/server/detention-history-queries";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-warning-soft text-[color:var(--warning)]",
    carried_forward: "bg-info-soft text-[color:var(--info)]",
    completed: "bg-success-soft text-[color:var(--success)]",
    waived: "bg-surface-muted text-muted-foreground",
  };
  return styles[status] ?? "bg-surface-muted text-muted-foreground";
}

export function DetentionHistoryView({ items }: { items: DetentionHistoryItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchSearch = !needle || `${item.learnerName} ${item.admissionNumber ?? ""} ${item.gradeName ?? ""} ${item.className ?? ""}`.toLowerCase().includes(needle);
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [items, query, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { pending: 0, carried_forward: 0, completed: 0, waived: 0 };
    for (const item of items) {
      if (map[item.status] !== undefined) map[item.status]++;
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-[var(--radius-md)] bg-surface-muted/55 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <label className="scolapro-control-surface flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3">
          <Search className="size-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by learner name, number, grade…"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />
          {query ? <button type="button" onClick={() => setQuery("")} className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}
        </label>
        <div className="flex gap-1 rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]">
          {[
            { value: "all", label: `All (${items.length})` },
            { value: "pending", label: `Pending (${counts.pending})` },
            { value: "carried_forward", label: `Carried (${counts.carried_forward})` },
            { value: "completed", label: `Completed (${counts.completed})` },
            { value: "waived", label: `Waived (${counts.waived})` },
          ].map((option) => (
            <button key={option.value} type="button" onClick={() => setStatusFilter(option.value)}
              className={`min-h-7 rounded-[var(--radius-xs)] px-2 text-[0.68rem] font-medium transition ${statusFilter === option.value ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"}`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="scolapro-section-title">Detention history</h2>
          <p className="scolapro-section-description">Complete detention obligation history including completed and waived records.</p>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-border-subtle">
            {filtered.map((item) => (
              <div key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <div className="min-w-0">
                  <p className="scolapro-record-title">{item.learnerName}</p>
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                    {item.admissionNumber ?? "No number"} · {item.gradeName ?? "—"} · {item.className ?? "—"}
                  </p>
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">
                    Week of {new Date(`${item.qualifyingWeekStart}T12:00:00`).toLocaleDateString()} · {item.qualifyingLateCount} late arrivals · Due {new Date(`${item.dueOn}T12:00:00`).toLocaleDateString()}
                  </p>
                  {item.resolutionNote ? (
                    <p className="mt-1 text-[0.68rem] italic text-muted-foreground">Note: {item.resolutionNote}</p>
                  ) : null}
                  {item.detentionSessionCount > 0 ? (
                    <p className="mt-1 text-[0.68rem] text-muted-foreground">
                      {item.detentionSessionCount} detention session{item.detentionSessionCount === 1 ? "" : "s"}
                      {item.latestSessionDate ? ` · last ${new Date(`${item.latestSessionDate}T12:00:00`).toLocaleDateString()}` : ""}
                      {item.latestRecordedOutcome ? ` · ${item.latestRecordedOutcome}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.completedAt ? (
                    <span className="text-[0.65rem] text-muted-foreground">
                      {new Date(item.completedAt).toLocaleDateString()}
                    </span>
                  ) : null}
                  <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium capitalize ${statusBadge(item.status)}`}>
                    {item.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground">
              <History className="size-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">No detention records</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              {items.length ? "No records match your current filters." : "No detention obligations have been recorded for this school."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
