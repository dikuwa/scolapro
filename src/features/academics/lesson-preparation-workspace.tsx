"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, CheckCircle2, Download, History, Link2, Printer, RotateCcw, Scissors, Send, Sparkles, Wrench } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Picker } from "@/components/ui/picker";
import {
  prepareLessonRange,
  recordTeachingActual,
  reuseLessonPreparation,
  saveLessonPreparation,
  submitLessonPreparation,
  type LessonPreparationActionState,
  type LessonPreparationRow,
  type LessonPreparationWorkspaceData,
} from "./server/lesson-preparation";
import { getCachedLessonPreparationDraft, queueLessonPreparationDraft, syncQueuedLessonPreparationDrafts } from "./offline/lesson-preparation-queue";
import type { OfflineScope } from "@/lib/offline/db";

const initialState: LessonPreparationActionState = { message: "" };
const fieldClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft";
const textareaClass = `${fieldClass} min-h-24 resize-y`;
const prepFields = [
  ["resources", "Resources / materials"], ["introduction", "Introduction"], ["lessonStructure", "Lesson structure"],
  ["teacherActivities", "Teacher activities"], ["learnerActivities", "Learner activities"], ["consolidation", "Consolidation"],
  ["assessment", "Assessment / homework / tasks / exercises"], ["homeworkMonitoring", "Homework monitoring"],
  ["differentiation", "Differentiation / learner support"], ["englishAcrossCurriculum", "English Across Curriculum"], ["compensatoryTeaching", "Compensatory teaching"],
  ["reflectionAmendments", "Reflection / amendments"],
] as const;

function monday(dateText: string) {
  const date = new Date(`${dateText}T12:00:00`); const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1); return date.toISOString().slice(0, 10);
}
function addDays(dateText: string, days: number) { const date = new Date(`${dateText}T12:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function weekNumber(dateText: string) { const date = new Date(`${dateText}T12:00:00`); const first = new Date(date.getFullYear(), 0, 1); return Math.ceil((((date.getTime() - first.getTime()) / 86400000) + first.getDay() + 1) / 7); }
function termForDate(data: LessonPreparationWorkspaceData, date: string) { return data.terms.find((term) => term.startsOn && term.endsOn && date >= term.startsOn && date <= term.endsOn) ?? null; }
function ActionMessage({ state }: { state: LessonPreparationActionState }) { return state.message ? <p className={`mt-2 text-xs ${state.success ? "text-success" : "text-danger"}`}>{state.message}</p> : null; }

export function LessonPreparationWorkspace({ data, offlineScope }: { data: LessonPreparationWorkspaceData; offlineScope: OfflineScope }) {
  const first = data.rows[0];
  const [scheduleId, setScheduleId] = useState(first?.scheduleId ?? "");
  const [allocationId, setAllocationId] = useState(first?.allocationId ?? "");
  const [rangeMode, setRangeMode] = useState<"lesson" | "week" | "weeks" | "term">("lesson");
  const [rangeFrom, setRangeFrom] = useState(first?.plannedOn ?? "");
  const [rangeTo, setRangeTo] = useState(first?.plannedOn ?? "");
  const [saveState, saveAction, savePending] = useActionState(saveLessonPreparation, initialState);
  const [rangeState, rangeAction, rangePending] = useActionState(prepareLessonRange, initialState);
  const [submitState, submitAction, submitPending] = useActionState(submitLessonPreparation, initialState);
  const [actualState, actualAction, actualPending] = useActionState(recordTeachingActual, initialState);
  const [reuseState, reuseAction, reusePending] = useActionState(reuseLessonPreparation, initialState);
  const [reuseTargetId, setReuseTargetId] = useState("");
  const [reuseSession, setReuseSession] = useState("1");
  const [offlineMessage, setOfflineMessage] = useState("");
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState("");
  const offlineMutationIds = useRef(new Map<string, string>());
  const selected = data.rows.find((row) => row.scheduleId === scheduleId) ?? first;
  const assignments = useMemo(() => { const seen = new Set<string>(); return data.rows.filter((row) => !seen.has(row.allocationId) && seen.add(row.allocationId)); }, [data.rows]);
  const lessons = data.rows.filter((row) => row.allocationId === allocationId);
  const reuseTargets = useMemo(() => selected?.preparationId
    ? data.rows.filter((row) => row.scheduleId !== selected.scheduleId
      && !row.preparationId
      && row.subjectOfferingId === selected.subjectOfferingId
      && row.curriculumUnitId === selected.curriculumUnitId)
    : [], [data.rows, selected]);

  function setRange(mode: typeof rangeMode, row: LessonPreparationRow) {
    setRangeMode(mode); setAllocationId(row.allocationId);
    const term = termForDate(data, row.plannedOn);
    if (mode === "lesson") { setRangeFrom(row.plannedOn); setRangeTo(row.plannedOn); }
    else if (mode === "week") { const from = monday(row.plannedOn); setRangeFrom(from); setRangeTo(addDays(from, 6)); }
    else if (mode === "weeks") { const from = monday(row.plannedOn); setRangeFrom(from); setRangeTo(addDays(from, 20)); }
    else if (term?.startsOn && term.endsOn) { setRangeFrom(term.startsOn); setRangeTo(term.endsOn); }
  }
  function chooseLesson(row: LessonPreparationRow) { setScheduleId(row.scheduleId); setRange(rangeMode, row); setAiMessage(""); }

  async function draftSection(section: string, mode: "draft" | "regenerate" | "shorten" | "practical") {
    const form = document.querySelector<HTMLFormElement>(`form[data-preparation-form="${selected.scheduleId}"]`);
    if (!form || typeof navigator === "undefined" || !navigator.onLine) {
      setAiMessage("AI drafting requires an online connection.");
      return;
    }
    const formData = new FormData(form);
    const selectedCompetencyIds = formData.getAll("selectedCompetencyIds").map(String).filter(Boolean);
    if (!selectedCompetencyIds.length) {
      setAiMessage("Select at least one specific objective / basic competency before using AI drafting.");
      return;
    }
    const control = form.elements.namedItem(section) as HTMLTextAreaElement | null;
    const sessionCount = Math.max(1, Math.min(30, Number(formData.get("sessionCount") ?? 1) || 1));
    setAiBusy(`${section}:${mode}`);
    setAiMessage("");
    try {
      const response = await fetch("/api/teaching/lesson-preparation/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId: selected.scheduleId,
          section,
          mode,
          selectedCompetencyIds,
          sessionCount,
          existingText: control?.value ?? "",
        }),
      });
      const body = await response.json().catch(() => ({})) as { text?: string; message?: string };
      if (!response.ok || !body.text) {
        setAiMessage(body.message ?? "AI drafting could not complete this section.");
        return;
      }
      if (control) {
        control.value = body.text;
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.focus();
      }
      setAiMessage("AI suggestion inserted as an editable draft. Review it before saving.");
    } catch {
      setAiMessage("AI drafting could not reach the configured service.");
    } finally {
      setAiBusy(null);
    }
  }

  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    const form = document.querySelector<HTMLFormElement>(`form[data-preparation-form="${selected.scheduleId}"]`);
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    void getCachedLessonPreparationDraft(offlineScope, selected.scheduleId).then((cached) => {
      if (!active || !cached || (selected.preparationStatus && selected.preparationStatus !== "draft")) return;
      offlineMutationIds.current.set(selected.scheduleId, cached.clientMutationId);
      for (const [name, value] of Object.entries(cached.preparation)) {
        const control = form.elements.namedItem(name) as HTMLTextAreaElement | null;
        if (control && !control.value) control.value = value;
      }
      setOfflineMessage("Draft restored from this device.");
    }).catch(() => undefined);
    const saveOffline = () => {
      if (navigator.onLine || (selected.preparationStatus && selected.preparationStatus !== "draft")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const clientMutationId = offlineMutationIds.current.get(selected.scheduleId) ?? crypto.randomUUID();
        offlineMutationIds.current.set(selected.scheduleId, clientMutationId);
        const formData = new FormData(form);
        const preparation = Object.fromEntries(prepFields.map(([name]) => [name, String(formData.get(name) ?? "")]));
        const selectedCompetencyIds = formData.getAll("selectedCompetencyIds").map(String).filter(Boolean);
        const sessionCount = Math.max(1, Math.min(30, Number(formData.get("sessionCount") ?? 1) || 1));
        void queueLessonPreparationDraft(offlineScope, {
          scheduleId: selected.scheduleId,
          clientMutationId,
          expectedUpdatedAt: selected.preparationUpdatedAt,
          preparation,
          selectedCompetencyIds,
          sessionCount,
        })
          .then(() => setOfflineMessage("Draft saved on this device and waiting to sync."))
          .catch(() => setOfflineMessage("This browser cannot save an offline draft."));
      }, 250);
    };
    const sync = () => {
      if (!navigator.onLine) return;
      void syncQueuedLessonPreparationDrafts(offlineScope).then(() => {
        offlineMutationIds.current.delete(selected.scheduleId);
      });
    };
    form.addEventListener("input", saveOffline);
    window.addEventListener("online", sync);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      form.removeEventListener("input", saveOffline);
      window.removeEventListener("online", sync);
    };
  }, [offlineScope, selected]);

  if (!data.rows.length) return <section className="rounded-[var(--radius-md)] bg-surface-muted p-6 text-sm text-muted-foreground">No connected scheduled lessons are available in your current effective teacher allocation. Lesson preparation starts from the shared pacing/schedule model; it does not create a disconnected plan.</section>;
  if (!selected) return null;
  const term = termForDate(data, selected.plannedOn);
  const locked = ["submitted", "reviewed", "archived"].includes(selected.preparationStatus ?? "");
  const offlineLocked = locked || (typeof navigator !== "undefined" && !navigator.onLine && Boolean(selected.preparationStatus && selected.preparationStatus !== "draft"));
  const effectiveReuseTargetId = reuseTargets.some((row) => row.scheduleId === reuseTargetId)
    ? reuseTargetId
    : (reuseTargets[0]?.scheduleId ?? "");
  const effectiveReuseSession = Number(reuseSession) <= selected.sessionCount ? reuseSession : "1";

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Assigned lesson</h2><p className="scolapro-section-description">School, teacher, subject, grade/class, schedule and curriculum context come from your connected current allocation.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-medium">Subject / class<select className={fieldClass} value={allocationId} onChange={(event) => { const row = data.rows.find((item) => item.allocationId === event.target.value); if (row) chooseLesson(row); }}>{assignments.map((row) => <option key={row.allocationId} value={row.allocationId}>{row.subject} · {row.grade} · {row.className}</option>)}</select></label>
        <label className="text-xs font-medium">Term / week / date<select className={fieldClass} value={scheduleId} onChange={(event) => { const row = data.rows.find((item) => item.scheduleId === event.target.value); if (row) chooseLesson(row); }}>{lessons.map((row) => <option key={row.scheduleId} value={row.scheduleId}>{termForDate(data, row.plannedOn)?.name ?? "Term not configured"} · Week {weekNumber(row.plannedOn)} · {row.plannedOn}</option>)}</select></label>
      </div>
      <div className="mt-4 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">Subject</p><p className="mt-1 text-sm font-medium">{selected.subject}</p></div><div><p className="text-xs text-muted-foreground">Class</p><p className="mt-1 text-sm font-medium">{selected.grade} · {selected.className}</p></div><div><p className="text-xs text-muted-foreground">Schedule</p><p className="mt-1 text-sm font-medium">{selected.plannedOn} · {selected.periods} period{selected.periods === 1 ? "" : "s"}</p></div><div><p className="text-xs text-muted-foreground">Curriculum version</p><p className="mt-1 text-sm font-medium">{selected.curriculumVersion ?? "Not linked"}</p></div></div>{selected.curriculumObsolete ? <div className="mt-3 rounded-[var(--radius-sm)] border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"><strong>Curriculum update detected.</strong> This preparation was created against {selected.preparationCurriculumVersion ?? "an earlier version"} while the current schedule resolves to {selected.curriculumVersion ?? "a newer version"}. Review the selected competencies before reuse or submission.</div> : null}
    </section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><h2 className="scolapro-section-title">Curriculum context</h2><p className="scolapro-section-description">General objectives provide context. The specific objectives / basic competencies selected below are the binding targets for this preparation.</p><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-[var(--radius-sm)] bg-surface-muted p-4"><p className="text-xs font-medium text-muted-foreground">Theme / topic</p><p className="mt-1.5 text-sm">{[selected.theme, selected.topic].filter(Boolean).join(" · ") || "No registry value available"}</p></div><div className="rounded-[var(--radius-sm)] bg-surface-muted p-4"><p className="text-xs font-medium text-muted-foreground">General objective</p>{selected.objectives.length ? <ul className="mt-1.5 list-disc pl-5 text-sm">{selected.objectives.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="mt-1.5 text-sm text-muted-foreground">No registry value available</p>}</div></div></section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="scolapro-section-title">Teacher preparation</h2><p className="scolapro-section-description">Draft input is buffered locally for low-bandwidth work. Saving and HOD submission are separate.</p></div>{selected.preparationId ? <div className="flex flex-wrap gap-2"><a className={buttonVariants({ variant: "neutral", size: "sm" })} href={`/api/official-documents/teaching-pack?preparation=${encodeURIComponent(selected.preparationId)}`} target="_blank" rel="noreferrer"><Printer className="size-4" />Print view</a><a className={buttonVariants({ variant: "soft", size: "sm" })} href={`/api/official-documents/teaching-pack?preparation=${encodeURIComponent(selected.preparationId)}&format=pdf`}><Download className="size-4" />Download PDF</a></div> : null}</div><form key={selected.scheduleId} data-preparation-form={selected.scheduleId} action={saveAction} className="mt-4 grid gap-4 md:grid-cols-2"><input type="hidden" name="scheduleId" value={selected.scheduleId} /><div className="md:col-span-2 rounded-[var(--radius-sm)] bg-surface-muted p-4"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-medium">Specific objectives / basic competencies</p><p className="mt-1 text-xs text-muted-foreground">Select the curriculum targets this preparation must teach. General objectives stay contextual.</p></div><label className="text-xs font-medium sm:w-32">Sessions<input className={fieldClass} type="number" name="sessionCount" min="1" max="30" defaultValue={selected.sessionCount} disabled={offlineLocked} /></label></div>{selected.competencyOptions.length ? <div className="mt-3 grid gap-1.5 md:grid-cols-2">{selected.competencyOptions.map((option) => <CheckboxField key={option.id} name="selectedCompetencyIds" value={option.id} label={option.text} defaultChecked={selected.selectedCompetencyIds.includes(option.id)} disabled={offlineLocked} />)}</div> : <p className="mt-3 text-sm text-muted-foreground">No registry value available</p>}</div>{prepFields.map(([name, label]) => <div key={name} className={name === "lessonStructure" ? "md:col-span-2" : ""}><div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={`prep-${name}`} className="text-xs font-medium">{label}</label>{!offlineLocked ? <div className="flex flex-wrap gap-1"><Button type="button" size="xs" variant="ghost" loading={aiBusy === `${name}:draft`} onClick={() => void draftSection(name, "draft")}><Sparkles className="size-3.5" />Draft</Button><Button type="button" size="xs" variant="ghost" loading={aiBusy === `${name}:regenerate`} onClick={() => void draftSection(name, "regenerate")}><RotateCcw className="size-3.5" />Regenerate</Button><Button type="button" size="xs" variant="ghost" loading={aiBusy === `${name}:shorten`} onClick={() => void draftSection(name, "shorten")}><Scissors className="size-3.5" />Shorten</Button><Button type="button" size="xs" variant="ghost" loading={aiBusy === `${name}:practical`} onClick={() => void draftSection(name, "practical")}><Wrench className="size-3.5" />Practical</Button></div> : null}</div><textarea id={`prep-${name}`} name={name} defaultValue={selected.preparation[name] ?? ""} className={textareaClass} disabled={offlineLocked} /></div>)}{!offlineLocked ? <div className="flex flex-wrap gap-2 md:col-span-2 sm:justify-end"><Button type="submit" name="intent" value="draft" variant="neutral" loading={savePending}>Save draft</Button><Button type="submit" name="intent" value="prepared" loading={savePending}><CheckCircle2 className="size-4" />Mark prepared</Button></div> : <p className="text-sm text-muted-foreground md:col-span-2">Submitted/reviewed preparation is read-only so planned history remains stable.</p>}<div className="md:col-span-2"><ActionMessage state={saveState} />{aiMessage ? <p className="mt-2 text-xs text-muted-foreground">{aiMessage}</p> : null}{offlineMessage ? <p className="mt-2 text-xs text-muted-foreground">{offlineMessage}</p> : null}</div></form>{selected.preparationId && !locked ? <form action={submitAction} className="mt-3 border-t border-border-subtle pt-3"><input type="hidden" name="scheduleId" value={selected.scheduleId} /><Button type="submit" variant="soft" loading={submitPending}><Send className="size-4" />Submit to HOD</Button><p className="mt-1 text-xs text-muted-foreground">Submission does not happen when saving or marking prepared.</p><ActionMessage state={submitState} /></form> : null}</section>

    {selected.preparationId ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="flex items-start gap-3"><Link2 className="mt-0.5 size-5 text-brand" /><div><h2 className="scolapro-section-title">Reuse this preparation</h2><p className="scolapro-section-description">Assign the same prepared content to another scheduled delivery of this subject/topic. Each delivery keeps its own taught status and reflection.</p></div></div>{reuseTargets.length ? <form action={reuseAction} className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end"><input type="hidden" name="preparationId" value={selected.preparationId} /><Picker label="Target lesson" name="targetScheduleId" value={effectiveReuseTargetId} onChange={setReuseTargetId} placeholder="Choose target lesson" options={reuseTargets.map((row) => ({ value: row.scheduleId, label: `${row.className} · ${row.plannedOn}`, helper: `${row.grade} · ${row.periods} period${row.periods === 1 ? "" : "s"}` }))} /><Picker label="Preparation session" name="sessionNumber" value={effectiveReuseSession} onChange={setReuseSession} placeholder="Session" options={Array.from({ length: selected.sessionCount }, (_, index) => ({ value: String(index + 1), label: `Session ${index + 1}` }))} /><Button type="submit" variant="soft" loading={reusePending}><Link2 className="size-4" />Assign preparation</Button><div className="md:col-span-3"><ActionMessage state={reuseState} /></div></form> : <p className="mt-4 text-sm text-muted-foreground">No unprepared scheduled delivery currently matches this subject offering and curriculum topic.</p>}</section> : null}

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="flex items-start gap-3"><CalendarRange className="mt-0.5 size-5 text-brand" /><div><h2 className="scolapro-section-title">Prepare a range</h2><p className="scolapro-section-description">Create editable draft shells for one lesson, a week, several weeks or a whole configured term. Nothing is submitted automatically.</p></div></div><form action={rangeAction} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="allocationId" value={allocationId} /><label className="text-xs font-medium">Range<select className={fieldClass} value={rangeMode} onChange={(event) => setRange(event.target.value as typeof rangeMode, selected)}><option value="lesson">One lesson</option><option value="week">One week</option><option value="weeks">Several weeks</option><option value="term">Whole term</option></select></label><label className="text-xs font-medium">From<input className={fieldClass} type="date" name="from" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} /></label><label className="text-xs font-medium">To<input className={fieldClass} type="date" name="to" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} /></label><div className="flex items-end"><Button type="submit" loading={rangePending}>Create draft preparations</Button></div></form><ActionMessage state={rangeState} />{rangeMode === "term" && !term ? <p className="mt-2 text-xs text-warning">No term dates are configured; choose the range manually.</p> : null}</section>

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="flex items-start gap-3"><History className="mt-0.5 size-5 text-brand" /><div><h2 className="scolapro-section-title">Actual teaching & reflection</h2><p className="scolapro-section-description">Retrospective delivery is recorded separately; the planned preparation and curriculum snapshot are not overwritten.</p></div></div>{selected.actualReflection ? <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-4 text-sm">{selected.actualReflection}</div> : null}<form action={actualAction} className="mt-4 grid gap-4 md:grid-cols-2"><input type="hidden" name="scheduleId" value={selected.scheduleId} /><label className="text-xs font-medium">Taught on<input className={fieldClass} type="date" name="taughtOn" defaultValue={selected.plannedOn} /></label><label className="text-xs font-medium">Coverage<select className={fieldClass} name="coverageState" defaultValue="taught"><option value="not_started">Not started</option><option value="started">Started</option><option value="partially_taught">Partially taught</option><option value="taught">Taught</option><option value="reinforcement_needed">Reinforcement needed</option><option value="assessed">Assessed</option></select></label><label className="text-xs font-medium">Periods used<input className={fieldClass} type="number" min="1" max="30" name="periodsUsed" defaultValue={selected.periods} /></label><label className="text-xs font-medium">Compensatory action<textarea className={textareaClass} name="compensatoryAction" /></label><label className="text-xs font-medium md:col-span-2">Reflection<textarea className={textareaClass} name="reflection" /></label><div className="md:col-span-2 flex justify-start sm:justify-end"><Button type="submit" loading={actualPending}>Record actual teaching</Button></div></form><ActionMessage state={actualState} /></section>
  </div>;
}
