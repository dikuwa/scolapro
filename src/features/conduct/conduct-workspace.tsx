"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";
import { ConductDialog, ConductForm, fieldClass, useConductFormPending } from "./controls";
import { recordConductEvent } from "./server/actions";
import type { ConductCategory, ConductDomain, ConductEvent, ConductHistory, ConductLearner, ConductPolicyGroup, ConductPolicyType } from "./types";

type Filters = { domain: ConductDomain; learnerId: string; classId: string; gradeId: string; on: string; page: number };

function signed(value: number | null | undefined) {
  if (value === null || value === undefined) return "No points";
  return value > 0 ? `+${value}` : String(value);
}

function EventForm({
  schoolId,
  groups,
  categories,
  learners,
  on,
  today,
  initialLearnerId,
  initialCategoryId,
  onSaved,
}: {
  schoolId: string;
  groups: ConductPolicyGroup[];
  categories: ConductCategory[];
  learners: ConductLearner[];
  on: string;
  today: string;
  initialLearnerId: string;
  initialCategoryId?: string;
  onSaved: () => void;
}) {
  const pending = useConductFormPending();
  const initialCategory = categories.find((item) => item.id === initialCategoryId && item.active);
  const initialGroup = groups.find((group) => group.id === initialCategory?.group_id && group.active);
  const [date, setDate] = useState(on);
  const [selected, setSelected] = useState<string[]>(initialLearnerId ? [initialLearnerId] : []);
  const [adding, setAdding] = useState(!initialLearnerId);
  const [type, setType] = useState<ConductPolicyType>(initialGroup?.type ?? "violation");
  const [groupId, setGroupId] = useState(initialGroup?.id ?? "");
  const [categoryId, setCategoryId] = useState(initialCategory?.id ?? "");

  const activeGroups = groups.filter((group) => group.active && group.type === type);
  const activeItems = categories.filter((item) =>
    item.active &&
    item.domain === "conduct" &&
    item.group_id === groupId &&
    (type === "recognition" ? item.direction === "positive" : item.direction === "negative"),
  );
  const category = categories.find((item) => item.id === categoryId);
  const group = groups.find((item) => item.id === groupId);
  const canSubmit = selected.length > 0 && Boolean(categoryId) && Boolean(groupId) && Boolean(date) && date <= today;

  function changeType(next: ConductPolicyType) {
    setType(next);
    setGroupId("");
    setCategoryId("");
  }

  return (
    <ConductForm action={recordConductEvent} onSaved={onSaved}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="type" value={type} />

      <DateField label="Event date" name="date" value={date} onChange={setDate} max={today} required />

      <div>
        <p className={formFieldLabelClass}>Learner(s)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((id) => {
            const learner = learners.find((item) => item.learner_id === id);
            return (
              <span key={id} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-1.5 text-sm">
                <input type="hidden" name="learnerIds" value={id} />
                {learner?.learner_name ?? "Selected learner"}
                <button
                  type="button"
                  aria-label={`Remove ${learner?.learner_name ?? "learner"}`}
                  onClick={() => { setSelected(selected.filter((value) => value !== id)); setAdding(true); }}
                  className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        {adding ? (
          <div className="mt-2">
            <Picker
              label="Choose learner"
              value=""
              onChange={(id) => { if (id) { setSelected([...selected, id]); setAdding(false); } }}
              options={learners.filter((learner) => !selected.includes(learner.learner_id)).map((learner) => ({
                value: learner.learner_id,
                label: learner.learner_name,
                helper: learner.class_name ?? "No class",
              }))}
              searchable
              searchPlaceholder="Type learner name"
              placeholder="Find learner"
            />
          </div>
        ) : (
          <Button type="button" variant="soft" size="sm" className="mt-2" disabled={selected.length >= 200} onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add another learner
          </Button>
        )}
      </div>

      <div>
        <p className={formFieldLabelClass}>Type</p>
        <div className="mt-2 inline-flex min-h-10 w-full items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1 sm:w-fit" role="group" aria-label="Conduct type">
          {(["recognition", "violation"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => changeType(value)}
              className={`inline-flex min-h-8 flex-1 items-center justify-center rounded-[var(--radius-xs)] px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:flex-none ${type === value ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {value === "recognition" ? "Recognition" : "Violation"}
            </button>
          ))}
        </div>
      </div>

      <Picker
        label="Group"
        value={groupId}
        onChange={(id) => { setGroupId(id); setCategoryId(""); }}
        options={activeGroups.map((item) => ({ value: item.id, label: item.display_name, helper: `${signed(item.default_points)} default` }))}
        placeholder={type === "recognition" ? "Choose Recognition group" : "Choose Violation group"}
      />

      <Picker
        label="Conduct item"
        name="categoryId"
        value={categoryId}
        onChange={setCategoryId}
        options={activeItems.map((item) => ({ value: item.id, label: item.display_name, helper: signed(item.points ?? group?.default_points) }))}
        searchable
        searchPlaceholder="Type conduct item"
        placeholder={groupId ? "Choose conduct item" : "Choose a group first"}
        disabled={!groupId}
      />

      {category ? (
        <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 text-sm">
          <p className="font-medium text-foreground">{category.display_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {type === "recognition" ? "Recognition" : "Violation"} · {group?.display_name ?? "Group"} · {signed(category.points ?? group?.default_points)}
            {type === "violation" && category.default_severity ? ` · ${category.default_severity}` : ""}
            {category.requires_management_attention ? " · Management attention" : ""}
          </p>
        </div>
      ) : null}

      <label className="block text-xs font-medium">
        Note <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea name="note" maxLength={10000} rows={3} className={`${fieldClass} py-2`} placeholder="Add context only when useful" />
      </label>

      <p className="text-xs leading-5 text-muted-foreground">
        The selected conduct item becomes the event title automatically. Keep counselling, medical and safeguarding detail in the restricted learner-support domain.
      </p>

      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={!canSubmit}>
          {type === "recognition" ? "Record recognition" : "Record violation"}
        </Button>
      </div>
    </ConductForm>
  );
}

export function ConductWorkspace({
  schoolId,
  groups,
  categories,
  learners,
  history,
  filters,
  today,
  canRecord,
  canManage,
}: {
  schoolId: string;
  groups: ConductPolicyGroup[];
  categories: ConductCategory[];
  learners: ConductLearner[];
  history: ConductHistory;
  filters: Filters;
  today: string;
  canRecord: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [quickCategoryId, setQuickCategoryId] = useState<string | undefined>();

  function change(patch: Partial<Filters>) {
    const next = { ...filters, domain: "conduct" as const, page: 0, ...patch };
    const query = new URLSearchParams({ on: next.on, page: String(next.page) });
    if (next.learnerId) query.set("learner", next.learnerId);
    if (next.classId) query.set("class", next.classId);
    if (next.gradeId) query.set("grade", next.gradeId);
    startTransition(() => router.push(`/conduct?${query}`));
  }

  const unique = (key: "grade_id" | "class_id", label: "grade_name" | "class_name", source: ConductLearner[]) =>
    [...new Map(source.filter((learner) => learner[key]).map((learner) => [learner[key]!, { value: learner[key]!, label: learner[label] ?? "Unlabelled" }])).values()];

  const roster = learners.filter((learner) => (!filters.gradeId || learner.grade_id === filters.gradeId) && (!filters.classId || learner.class_id === filters.classId));
  const eventGroups = new Map<string, ConductEvent[]>();
  for (const event of history.events) {
    const key = event.event_group_id ?? event.id;
    eventGroups.set(key, [...(eventGroups.get(key) ?? []), event]);
  }

  const activeGroups = groups.filter((group) => group.active);
  const activeConductItems = categories.filter((item) => item.active && item.domain === "conduct" && item.group_id && activeGroups.some((group) => group.id === item.group_id));
  const recognitionItems = activeConductItems.filter((item) => item.direction === "positive");
  const violationItems = activeConductItems.filter((item) => item.direction === "negative");
  const quickRecognition = recognitionItems.slice(0, 4);
  const addDisabled = !activeConductItems.length || !roster.length || pending;

  const summary = {
    recognitions: recognitionItems.length,
    violations: violationItems.length,
    learners: roster.length,
    recent: eventGroups.size,
  };

  function openRecorder(categoryId?: string) {
    setQuickCategoryId(categoryId);
    setOpen(true);
  }

  return (
    <div className="space-y-5" aria-busy={pending}>
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 lg:grid-cols-4">
        <div className="px-4 py-4 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Recognition items</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-mint)]">{summary.recognitions}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Violation items</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-amber)]">{summary.violations}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 lg:border-l lg:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Learners in scope</p><p className="mt-1.5 text-2xl font-semibold">{summary.learners}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 lg:border-l lg:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Recent groups</p><p className="mt-1.5 text-2xl font-semibold">{summary.recent}</p></div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="scolapro-section-title">Record conduct</h2>
            <p className="scolapro-section-description">Choose learner(s), type, group and item. ScolaPro supplies the policy title, points and severity.</p>
          </div>
          {canRecord ? <Button type="button" onClick={() => openRecorder()} disabled={addDisabled}><Plus className="size-4" />Record conduct</Button> : null}
        </div>

        {quickRecognition.length ? (
          <div className="mt-4 border-t border-border-subtle pt-4">
            <p className="text-xs font-medium text-muted-foreground">Quick Recognition</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {quickRecognition.map((item) => (
                <Button key={item.id} type="button" variant="soft" size="sm" disabled={addDisabled} onClick={() => openRecorder(item.id)}>+ {item.display_name}</Button>
              ))}
            </div>
          </div>
        ) : null}

        {!activeConductItems.length ? (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-warning-soft px-4 py-3.5">
            <p className="text-sm font-medium text-[color:var(--warning)]">No active conduct items are available.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{canManage ? "Open Conduct policy to add or restore Recognition and Violation items." : "Ask school management to configure the conduct policy."}</p>
          </div>
        ) : canRecord && !roster.length ? (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-info-soft px-4 py-3.5">
            <p className="text-sm font-medium text-[color:var(--info)]">No learners are enrolled in your current scope for the selected date and filters.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Change the roster date or clear grade/class filters.</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5" aria-label="Conduct filters">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DateField label="Roster / event date" name="rosterDate" value={filters.on} onChange={(on) => { if (on) change({ on, gradeId: "", classId: "" }); }} max={today} />
          <Picker label="Grade" value={filters.gradeId} onChange={(gradeId) => change({ gradeId, classId: "", learnerId: "" })} options={[{ value: "", label: "All grades" }, ...unique("grade_id", "grade_name", learners)]} placeholder="All grades" disabled={pending} />
          <Picker label="Class" value={filters.classId} onChange={(classId) => change({ classId, learnerId: "" })} options={[{ value: "", label: "All classes" }, ...unique("class_id", "class_name", learners.filter((learner) => !filters.gradeId || learner.grade_id === filters.gradeId))]} placeholder="All classes" disabled={pending} />
          <Picker label="Learner history" value={filters.learnerId} onChange={(learnerId) => change({ learnerId, classId: "", gradeId: "" })} searchable searchPlaceholder="Type learner name" options={[{ value: "", label: "All learners" }, ...learners.map((learner) => ({ value: learner.learner_id, label: learner.learner_name, helper: learner.class_name ?? learner.grade_name ?? "No class" }))]} placeholder="All learners" disabled={pending} />
        </div>
      </section>

      {pending ? <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground" role="status"><Spinner className="size-4" /><span>Updating view…</span></div> : null}

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div>
          <h2 className="scolapro-section-title">{filters.learnerId ? "Learner conduct history" : "Recent conduct"}</h2>
          <p className="scolapro-section-description">Recognition and Violations share one auditable Conduct history. Historical policy meaning is preserved.</p>
        </div>
        {!eventGroups.size ? (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">No conduct records found</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">No accessible records match the current filters.</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border-subtle">
            {[...eventGroups.entries()].map(([key, events]) => {
              const event = events[0];
              const policyType = event.category_snapshot?.group?.type ?? (event.direction === "positive" ? "recognition" : "violation");
              return (
                <article key={key} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <h3 className="scolapro-record-title min-w-0">{event.title}</h3>
                    <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{event.event_date}</time>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{policyType === "recognition" ? "Recognition" : "Violation"}</span>
                    {event.category_snapshot?.group?.display_name ? <><span aria-hidden="true">·</span><span>{event.category_snapshot.group.display_name}</span></> : null}
                    {event.category_snapshot?.points !== undefined ? <><span aria-hidden="true">·</span><span>{signed(event.category_snapshot.points)}</span></> : null}
                    {policyType === "violation" && event.severity ? <><span aria-hidden="true">·</span><span className="capitalize">{event.severity}</span></> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
                    {events.map((row) => (
                      <Link key={row.id} href={`/conduct/learners/${row.learner_id}`} className="font-medium text-brand-strong hover:underline">
                        {row.learner_name}
                      </Link>
                    ))}
                  </div>
                  {event.details ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{event.details}</p> : null}
                </article>
              );
            })}
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
        <ConductDialog title="Record conduct" onClose={() => setOpen(false)}>
          <EventForm
            schoolId={schoolId}
            groups={groups}
            categories={categories}
            learners={roster}
            on={filters.on}
            today={today}
            initialLearnerId={roster.some((learner) => learner.learner_id === filters.learnerId) ? filters.learnerId : ""}
            initialCategoryId={quickCategoryId}
            onSaved={() => setOpen(false)}
          />
        </ConductDialog>
      ) : null}
    </div>
  );
}
