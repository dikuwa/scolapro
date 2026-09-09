"use client";
import Link from "next/link";
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
          {selected.map(id => <span key={id} className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-sm"><input type="hidden" name="learnerIds" value={id} />{learners.find(l => l.learner_id === id)?.learner_name ?? "Selected learner"}<button type="button" aria-label={`Remove ${learners.find(l => l.learner_id === id)?.learner_name ?? "learner"}`} onClick={() => { setSelected(selected.filter(x => x !== id)); setAdding(true); }}>×</button></span>)}
        </div>
        {adding ? (
          <div className="mt-2">
            <Picker label="Choose learner" value="" onChange={id => { setSelected([...selected, id]); setAdding(false); }} options={learners.filter(l => !selected.includes(l.learner_id)).map(l => ({ value: l.learner_id, label: l.learner_name, helper: l.class_name ?? "No class" }))} searchable placeholder="Find learner" />
          </div>
        ) : (
          <Button type="button" variant="soft" className="mt-2" disabled={selected.length >= 200} onClick={() => setAdding(true)}>
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
      <p className="text-xs text-muted-foreground">Keep restricted counselling or medical details in learner support. Saving requires an internet connection.</p>
      <Button type="submit" loading={pending} disabled={!canSubmit}>{domain === "conduct" ? "Record incident" : "Record achievement"}</Button>
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
    <div className="space-y-5" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex min-h-10 w-fit items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1" role="group" aria-label="Conduct record type">
          {([['conduct', 'Incidents'], ['achievement', 'Achievements']] as const).map(([value, label]) => {
            const selectedTab = filters.domain === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selectedTab}
                disabled={pending}
                onClick={() => change({ domain: value })}
                className={`inline-flex min-h-8 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-sm font-medium transition ${selectedTab ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {canRecord ? (
          <Button type="button" variant="soft" onClick={() => setOpen(true)} disabled={addDisabled}>
            <Plus className="size-4" aria-hidden="true" />
            {filters.domain === "conduct" ? "Incident" : "Achievement"}
          </Button>
        ) : null}
      </div>

      {!active ? (
        <div className="rounded-[var(--radius-sm)] bg-warning-soft px-4 py-3">
          <p className="text-xs font-medium text-[color:var(--warning)]">No active categories are configured for {filters.domain === "conduct" ? "incidents" : "achievements"}, so new records cannot be started from this page.</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{canManage ? <Link className="underline decoration-border underline-offset-2 hover:text-foreground" href="/school/setup#conduct-categories">Configure conduct policy</Link> : "Ask a school administrator or principal to configure the policy."}</p>
        </div>
      ) : canRecord && !roster.length ? (
        <div className="rounded-[var(--radius-sm)] bg-info-soft px-4 py-3">
          <p className="text-xs font-medium text-[color:var(--info)]">No learners are enrolled on {filters.on} for the current grade/class filters.</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Choose a different roster / event date or clear the grade and class filters to start a record. History below still shows earlier events.</p>
        </div>
      ) : null}

      <div className="grid gap-4 rounded-[var(--radius-sm)] bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4">
        <DateField label="Event date" name="rosterDate" value={filters.on} onChange={on => { if (on) change({ on, gradeId: "", classId: "" }); }} max={today} />
        <Picker label="Grade" value={filters.gradeId} onChange={gradeId => change({ gradeId, classId: "", learnerId: "" })} options={[{ value: "", label: "All grades" }, ...unique("grade_id", "grade_name", learners)]} placeholder="All grades" disabled={pending} />
        <Picker label="Class" value={filters.classId} onChange={classId => change({ classId, learnerId: "" })} options={[{ value: "", label: "All classes" }, ...unique("class_id", "class_name", learners.filter(l => !filters.gradeId || l.grade_id === filters.gradeId))]} placeholder="All classes" disabled={pending} />
        <Picker label="Learner history" value={filters.learnerId} onChange={learnerId => change({ learnerId, classId: "", gradeId: "" })} searchable options={[{ value: "", label: "All learners" }, ...learners.map(l => ({ value: l.learner_id, label: l.learner_name, helper: l.grade_name ?? "No grade" }))]} placeholder={filters.learnerId ? "Selected learner history" : "All learners"} disabled={pending} />
      </div>

      {pending ? <div className="flex justify-center py-2"><Spinner /></div> : null}

      <section>
        <h2 className="scolapro-section-title">{filters.learnerId ? "Learner history" : "Recent history"}</h2>
        <p className="scolapro-section-description">History includes earlier dates. Class filters use the event’s recorded enrolment; learner history spans class changes within this school.</p>
        {!groups.size ? <p className="py-6 text-sm text-muted-foreground">No accessible records match these filters.</p> : (
          <div className="mt-4 divide-y divide-border-subtle">
            {[...groups.entries()].map(([key, events]) => { const e = events[0]; return (
              <article key={key} className="space-y-2 py-4">
                <div className="flex flex-wrap justify-between gap-2"><h3 className="scolapro-record-title">{e.title}</h3><time className="text-xs text-muted-foreground">{e.event_date}</time></div>
                <p className="text-xs text-muted-foreground">{e.category_snapshot?.display_name ?? e.category_code} · {filters.domain === "conduct" ? `${e.direction}${e.direction === "negative" ? ` · ${e.severity}` : ""} · ${e.status}` : e.level}</p>
                <p className="text-sm">{events.map(row => row.learner_name).join(", ")}</p>
                {e.details ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{e.details}</p> : null}
              </article>
            ); })}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button variant="soft" size="sm" disabled={pending || filters.page === 0} onClick={() => change({ page: filters.page - 1 })}>Previous</Button>
          <span className="text-xs">Page {filters.page + 1}</span>
          <Button variant="soft" size="sm" disabled={pending || !history.hasMore} onClick={() => change({ page: filters.page + 1 })}>Next</Button>
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
