"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { DateField } from "@/components/ui/date-field";
import { Spinner } from "@/components/ui/spinner";
import { ConductDialog, ConductForm, useConductFormPending, fieldClass } from "./controls";
import { recordConductEvent } from "./server/actions";
import type { ConductCategory, ConductDomain, ConductEvent, ConductHistory, ConductLearner } from "./types";

type Filters = { domain: ConductDomain; learnerId: string; classId: string; gradeId: string; on: string; page: number };

function EventForm({ schoolId, domain, categories, learners, on, today, initialLearnerId, onSaved }: { schoolId: string; domain: ConductDomain; categories: ConductCategory[]; learners: ConductLearner[]; on: string; today: string; initialLearnerId: string; onSaved: () => void }) {
  const pending = useConductFormPending();
  const [date, setDate] = useState(on);
  const [selected, setSelected] = useState<string[]>(initialLearnerId ? [initialLearnerId] : []);
  const [adding, setAdding] = useState(!initialLearnerId);
  const [categoryId, setCategoryId] = useState("");
  const [severity, setSeverity] = useState("routine");
  const [level, setLevel] = useState("school");
  const category = categories.find(c => c.id === categoryId);
  const options = categories.filter(c => c.domain === domain && c.active);
  const canSubmit = selected.length > 0 && Boolean(categoryId) && Boolean(date) && date <= today;
  return (
    <ConductForm action={recordConductEvent} onSaved={onSaved}>
      <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="domain" value={domain} />
      <DateField label="Event date" name="date" value={date} onChange={setDate} max={today} required />
      <p className="text-xs leading-5 text-muted-foreground">Learners are listed for roster date {on}. Change the page’s roster date to find learners from an earlier enrolment.</p>
      <div>
        <p className="text-xs font-medium">Learners</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map(id => <span key={id} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-1.5 text-sm"><input type="hidden" name="learnerIds" value={id} />{learners.find(l => l.learner_id === id)?.learner_name ?? "Selected learner"}<button type="button" aria-label={`Remove ${learners.find(l => l.learner_id === id)?.learner_name ?? "learner"}`} onClick={() => { setSelected(selected.filter(x => x !== id)); setAdding(true); }} className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">×</button></span>)}
        </div>
        {adding ? (
          <div className="mt-2">
            <Picker label="Choose learner" value="" onChange={id => { setSelected([...selected, id]); setAdding(false); }} options={learners.filter(l => !selected.includes(l.learner_id)).map(l => ({ value: l.learner_id, label: l.learner_name, helper: l.class_name ?? "No class" }))} searchable placeholder="Find learner" />
          </div>
        ) : (
          <Button type="button" variant="soft" size="sm" className="mt-2" disabled={selected.length >= 200} onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add another learner
          </Button>
        )}
      </div>
      <Picker label="Category" name="categoryId" value={categoryId} onChange={id => { setCategoryId(id); setSeverity(categories.find(c => c.id === id)?.default_severity ?? "routine"); }} options={options.map(c => ({ value: c.id, label: c.display_name, helper: c.direction === "positive" ? "Positive" : c.direction === "negative" ? "Negative" : undefined }))} searchable placeholder="Choose category" />
      {domain === "conduct" && category?.direction === "negative" ? <Picker label="Severity" name="severity" value={severity} onChange={setSeverity} options={["routine", "moderate", "serious", "critical"].map(value => ({ value, label: value }))} placeholder="Severity" /> : null}
      {domain === "achievement" ? <Picker label="Level" name="level" value={level} onChange={setLevel} options={["class", "school", "circuit", "regional", "national", "international", "other"].map(value => ({ value, label: value }))} placeholder="Level" /> : null}
      <label className="block text-xs font-medium">{domain === "conduct" ? "Summary" : "Title"}<input name="title" required maxLength={240} className={fieldClass} /></label>
      <label className="block text-xs font-medium">{domain === "conduct" ? "Details (optional)" : "Description (optional)"}<textarea name="details" maxLength={10000} rows={4} className={fieldClass} /></label>
      <p className="text-xs leading-5 text-muted-foreground">Keep restricted counselling or medical details in learner support. Saving requires an internet connection.</p>
      <div className="flex justify-start sm:justify-end">
        <Button type="submit" loading={pending} disabled={!canSubmit}>{domain === "conduct" ? "Record incident" : "Record achievement"}</Button>
      </div>
    </ConductForm>
  );
}

export function ConductWorkspace({ schoolId, categories, learners, history, filters, today, canRecord, canManage }: { schoolId: string; categories: ConductCategory[]; learners: ConductLearner[]; history: ConductHistory; filters: Filters; today: string; canRecord: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  function change(patch: Partial<Filters>) {
    const next = { ...filters, page: 0, ...patch };
    const query = new URLSearchParams({ tab: next.domain, on: next.on, page: String(next.page) });
    if (next.learnerId) query.set("learner", next.learnerId);
    if (next.classId) query.set("class", next.classId);
    if (next.gradeId) query.set("grade", next.gradeId);
    startTransition(() => router.push(`/conduct?${query}`));
  }
  const unique = (key: "grade_id" | "class_id", label: "grade_name" | "class_name", source: ConductLearner[]) => [...new Map(source.filter(l => l[key]).map(l => [l[key]!, { value: l[key]!, label: l[label] ?? "Unlabelled" }])).values()];
  const roster = learners.filter(l => (!filters.gradeId || l.grade_id === filters.gradeId) && (!filters.classId || l.class_id === filters.classId));
  const groups = new Map<string, ConductEvent[]>();
  for (const event of history.events) { const key = event.event_group_id ?? event.id; groups.set(key, [...(groups.get(key) ?? []), event]); }
  const active = categories.some(c => c.domain === filters.domain && c.active);
  const addDisabled = !active || !roster.length || pending;
  return (
    <div className="space-y-6" aria-busy={pending}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex min-h-10 w-full items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1 sm:w-fit" role="group" aria-label="Conduct record type">
          {([['conduct', 'Incidents'], ['achievement', 'Achievements']] as const).map(([value, label]) => {
            const selectedTab = filters.domain === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selectedTab}
                disabled={pending}
                onClick={() => change({ domain: value })}
                className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:min-w-[6.5rem] sm:flex-none ${selectedTab ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {canRecord ? (
          <Button type="button" variant="soft" onClick={() => setOpen(true)} disabled={addDisabled} className="self-start sm:self-auto">
            <Plus className="size-4" aria-hidden="true" />
            {filters.domain === "conduct" ? "Incident" : "Achievement"}
          </Button>
        ) : null}
      </div>

      {!active ? (
        <div className="rounded-[var(--radius-md)] border border-border-subtle bg-warning-soft px-4 py-3.5">
          <p className="text-sm font-medium text-[color:var(--warning)]">No active categories are configured for {filters.domain === "conduct" ? "incidents" : "achievements"}.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{canManage ? "Use Configure conduct policy to add or reactivate categories before starting a new record." : "Ask a school administrator or principal to configure the policy."}</p>
        </div>
      ) : canRecord && !roster.length ? (
        <div className="rounded-[var(--radius-md)] border border-border-subtle bg-info-soft px-4 py-3.5">
          <p className="text-sm font-medium text-[color:var(--info)]">No learners are enrolled on {filters.on} for the current grade/class filters.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose a different roster / event date or clear the grade and class filters to start a record. History below still shows earlier events.</p>
        </div>
      ) : null}

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5" aria-label="Conduct filters">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DateField label="Event date" name="rosterDate" value={filters.on} onChange={on => { if (on) change({ on, gradeId: "", classId: "" }); }} max={today} />
          <Picker label="Grade" value={filters.gradeId} onChange={gradeId => change({ gradeId, classId: "", learnerId: "" })} options={[{ value: "", label: "All grades" }, ...unique("grade_id", "grade_name", learners)]} placeholder="All grades" disabled={pending} />
          <Picker label="Class" value={filters.classId} onChange={classId => change({ classId, learnerId: "" })} options={[{ value: "", label: "All classes" }, ...unique("class_id", "class_name", learners.filter(l => !filters.gradeId || l.grade_id === filters.gradeId))]} placeholder="All classes" disabled={pending} />
          <Picker label="Learner history" value={filters.learnerId} onChange={learnerId => change({ learnerId, classId: "", gradeId: "" })} searchable options={[{ value: "", label: "All learners" }, ...learners.map(l => ({ value: l.learner_id, label: l.learner_name, helper: l.grade_name ?? "No grade" }))]} placeholder={filters.learnerId ? "Selected learner history" : "All learners"} disabled={pending} />
        </div>
      </section>

      {pending ? <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground" role="status"><Spinner className="size-4" /><span>Updating view…</span></div> : null}

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div>
          <h2 className="scolapro-section-title">{filters.learnerId ? "Learner history" : "Recent history"}</h2>
          <p className="scolapro-section-description">History includes earlier dates. Class filters use the event’s recorded enrolment; learner history spans class changes within this school.</p>
        </div>
        {!groups.size ? (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">No conduct records found</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">No accessible records match the current filters.</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border-subtle">
            {[...groups.entries()].map(([key, events]) => { const e = events[0]; return (
              <article key={key} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"><h3 className="scolapro-record-title min-w-0">{e.title}</h3><time className="shrink-0 text-xs tabular-nums text-muted-foreground">{e.event_date}</time></div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{e.category_snapshot?.display_name ?? e.category_code}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{filters.domain === "conduct" ? e.direction : e.level}</span>
                  {filters.domain === "conduct" && e.direction === "negative" ? <><span aria-hidden="true">·</span><span className="capitalize">{e.severity}</span></> : null}
                  {filters.domain === "conduct" ? <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 font-medium capitalize text-foreground">{e.status}</span> : null}
                </div>
                <p className="text-sm text-foreground">{events.map(row => row.learner_name).join(", ")}</p>
                {e.details ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{e.details}</p> : null}
              </article>
            ); })}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <span className="text-xs tabular-nums text-muted-foreground">Page {filters.page + 1}</span>
          <div className="flex items-center gap-2">
            <Button variant="neutral" size="sm" disabled={pending || filters.page === 0} onClick={() => change({ page: filters.page - 1 })}>Previous</Button>
            <Button variant="neutral" size="sm" disabled={pending || !history.hasMore} onClick={() => change({ page: filters.page + 1 })}>Next</Button>
          </div>
        </div>
      </section>

      {open ? (
        <ConductDialog title={`Record ${filters.domain === "conduct" ? "incident" : "achievement"}`} onClose={() => setOpen(false)}>
          <EventForm schoolId={schoolId} domain={filters.domain} categories={categories} learners={roster} on={filters.on} today={today} initialLearnerId={roster.some(l => l.learner_id === filters.learnerId) ? filters.learnerId : ""} onSaved={() => setOpen(false)} />
        </ConductDialog>
      ) : null}
    </div>
  );
}
