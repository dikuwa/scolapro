"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import type { ConductManagementView } from "./server/management";

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function ConductManagementDashboard({
  view,
  filters,
  gradeOptions,
  classOptions,
}: {
  view: ConductManagementView;
  filters: {
    query: string;
    gradeId: string;
    classId: string;
    attentionOnly: boolean;
    repeatedOnly: boolean;
    page: number;
  };
  gradeOptions: Array<{ value: string; label: string }>;
  classOptions: Array<{ value: string; label: string; gradeId: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query);

  function change(patch: Partial<typeof filters>) {
    const next = { ...filters, page: 0, ...patch };
    const params = new URLSearchParams();
    if (next.query) params.set("q", next.query);
    if (next.gradeId) params.set("grade", next.gradeId);
    if (next.classId) params.set("class", next.classId);
    if (next.attentionOnly) params.set("attention", "1");
    if (next.repeatedOnly) params.set("repeated", "1");
    if (next.page) params.set("page", String(next.page));
    startTransition(() => router.push(`/conduct/manage?${params}`));
  }

  const classes = classOptions.filter((item) => !filters.gradeId || item.gradeId === filters.gradeId);

  return (
    <div className="space-y-5" aria-busy={pending}>
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-6">
        <div className="px-4 py-4 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Active learners</p><p className="mt-1.5 text-2xl font-semibold">{view.summary.active_learners}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">With records</p><p className="mt-1.5 text-2xl font-semibold">{view.summary.learners_with_records}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 xl:border-l xl:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Recognitions</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-mint)]">{view.summary.recognition_count}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 sm:border-l xl:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Violations</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-amber)]">{view.summary.violation_count}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 xl:border-l xl:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Attention events</p><p className="mt-1.5 text-2xl font-semibold">{view.summary.attention_event_count}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 sm:border-l xl:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Repeated patterns</p><p className="mt-1.5 text-2xl font-semibold">{view.summary.learners_with_repeated_patterns}</p></div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div>
          <h2 className="scolapro-section-title">Learner conduct overview</h2>
          <p className="scolapro-section-description">Scan first. Open a learner only when you need the detailed Conduct profile.</p>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_12rem_14rem_auto_auto]">
          <form
            className="block"
            onSubmit={(event) => {
              event.preventDefault();
              change({ query });
            }}
          >
            <span className="mb-1.5 block text-xs font-medium text-foreground">Learner</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search learner"
                className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] pl-9 pr-3 text-sm outline-none"
              />
            </div>
          </form>
          <Picker label="Grade" value={filters.gradeId} onChange={(gradeId) => change({ gradeId, classId: "" })} options={[{ value: "", label: "All grades" }, ...gradeOptions]} placeholder="All grades" />
          <Picker label="Class" value={filters.classId} onChange={(classId) => change({ classId })} options={[{ value: "", label: "All classes" }, ...classes.map(({ value, label }) => ({ value, label }))]} placeholder="All classes" />
          <div className="flex items-end">
            <Button className="min-h-10 w-full" type="button" variant={filters.attentionOnly ? "soft" : "neutral"} onClick={() => change({ attentionOnly: !filters.attentionOnly })}>Attention only</Button>
          </div>
          <div className="flex items-end">
            <Button className="min-h-10 w-full" type="button" variant={filters.repeatedOnly ? "soft" : "neutral"} onClick={() => change({ repeatedOnly: !filters.repeatedOnly })}>Repeated only</Button>
          </div>
        </div>

        {pending ? <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Spinner className="size-4" />Updating view…</div> : null}

        <div className="mt-4 overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-surface-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Learner</th>
                <th className="px-3 py-2.5 font-medium">Class</th>
                <th className="px-3 py-2.5 font-medium">Recognition</th>
                <th className="px-3 py-2.5 font-medium">Violations</th>
                <th className="px-3 py-2.5 font-medium">Net</th>
                <th className="px-3 py-2.5 font-medium">Indicators</th>
                <th className="px-3 py-2.5 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {view.learners.length ? view.learners.map((learner) => (
                <tr key={learner.learner_id} className="bg-surface align-top">
                  <td className="px-3 py-3">
                    <Link href={`/conduct/learners/${learner.learner_id}`} className="font-semibold text-brand-strong hover:underline">{learner.learner_name}</Link>
                    <p className="mt-1 text-xs text-muted-foreground">{learner.grade_name ?? "No grade"}</p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{learner.class_name ?? "No class"}</td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{learner.recognition_count} event{learner.recognition_count === 1 ? "" : "s"}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{signed(learner.recognition_points)} pts</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{learner.violation_count} event{learner.violation_count === 1 ? "" : "s"}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{signed(learner.violation_points)} pts</span>
                  </td>
                  <td className="px-3 py-3 font-medium">{signed(learner.net_points)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {learner.attention_event_count > 0 ? <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-xs font-medium text-[color:var(--warning)]">{learner.attention_event_count} attention</span> : null}
                      {learner.repeated_pattern_count > 0 ? <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs font-medium">{learner.repeated_pattern_count} repeated pattern{learner.repeated_pattern_count === 1 ? "" : "s"}</span> : null}
                      {learner.attention_event_count === 0 && learner.repeated_pattern_count === 0 ? <span className="text-xs text-muted-foreground">None</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">{learner.last_event_on ?? "No record"}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No learners match the current Conduct filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Page {filters.page + 1}</span>
          <div className="flex gap-2">
            <Button type="button" variant="neutral" size="sm" disabled={pending || filters.page === 0} onClick={() => change({ page: filters.page - 1 })}>Previous</Button>
            <Button type="button" variant="neutral" size="sm" disabled={pending || !view.hasMore} onClick={() => change({ page: filters.page + 1 })}>Next</Button>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div>
          <h2 className="scolapro-section-title">Policy usage</h2>
          <p className="scolapro-section-description">Most-used Recognition and Violation items in {view.academicYear}. This is usage data, not a ranking of learners.</p>
        </div>
        <div className="mt-4 divide-y divide-border-subtle">
          {view.policyUsage.length ? view.policyUsage.map((item) => (
            <div key={`${item.type}:${item.group_name}:${item.item_name}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{item.item_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.type === "recognition" ? "Recognition" : "Violation"} · {item.group_name}</p>
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">{item.event_count} events · {item.learner_count} learners · {signed(item.points)}</p>
            </div>
          )) : <p className="py-5 text-sm text-muted-foreground">No Conduct policy usage has been recorded for this academic year.</p>}
        </div>
      </section>

      <p className="text-xs leading-5 text-muted-foreground">Attention and repeated-pattern indicators are review prompts only. They do not classify a learner or make disciplinary decisions automatically.</p>
    </div>
  );
}
