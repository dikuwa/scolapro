"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Paperclip, Save, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import type { AttendanceClassOption, AttendanceReasonOption } from "@/features/attendance/server/register";
import { submitWeeklyRegister, type WeeklyRegisterState } from "@/features/attendance/server/week-actions";
import type { WeeklyCell, WeeklyLearnerRow } from "@/features/attendance/server/week";

const initialState: WeeklyRegisterState = {};
type SexFilter = "all" | "male" | "female";
type WeeklyStatus = WeeklyCell["status"];

function shiftWeek(date: string, weeks: number) {
  const current = new Date(`${date}T12:00:00`);
  current.setDate(current.getDate() + weeks * 7);
  return current.toISOString().slice(0, 10);
}

function keyFor(enrolmentId: string, date: string) { return `${enrolmentId}:${date}`; }

function presentation(status: WeeklyStatus) {
  if (status === "absent") return { classes: "bg-danger-soft text-[color:var(--danger)]", icon: X, label: "Absent" };
  if (status === "late") return { classes: "bg-warning-soft text-[color:var(--warning)]", icon: Clock3, label: "Late" };
  if (status === "excused") return { classes: "bg-info-soft text-[color:var(--info)]", icon: ShieldCheck, label: "Excused" };
  return { classes: "bg-success-soft text-[color:var(--success)]", icon: Check, label: "Present" };
}

export function WeeklyRegister({ classes, selectedClassId, dates, learners, reasons, submissionIds }: {
  classes: AttendanceClassOption[];
  selectedClassId: string | null;
  dates: string[];
  learners: WeeklyLearnerRow[];
  reasons: AttendanceReasonOption[];
  submissionIds: Record<string, string>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitWeeklyRegister, initialState);
  const [navigationPending, startNavigation] = useTransition();
  const [rows, setRows] = useState(learners);
  const [activeKey, setActiveKey] = useState("");
  const [expandedMobileLearnerId, setExpandedMobileLearnerId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("all");
  const [evidenceNames, setEvidenceNames] = useState<Record<string, string>>({});
  const [mutationIds] = useState(() => Object.fromEntries(dates.map((date) => [date, crypto.randomUUID()])));

  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [router, state]);

  useEffect(() => {
    if (!dates[0]) return;
    router.prefetch(`/attendance?view=day&date=${dates[0]}${selectedClassId ? `&class=${encodeURIComponent(selectedClassId)}` : ""}`);
    if (!selectedClassId) return;
    router.prefetch(`/attendance?view=week&class=${encodeURIComponent(selectedClassId)}&date=${shiftWeek(dates[0], -1)}`);
    router.prefetch(`/attendance?view=week&class=${encodeURIComponent(selectedClassId)}&date=${shiftWeek(dates[0], 1)}`);
  }, [dates, router, selectedClassId]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const searchMatch = !needle || `${row.name} ${row.admissionNumber ?? ""}`.toLowerCase().includes(needle);
      const sexMatch = sexFilter === "all" || (row.sex ?? "").toLowerCase() === sexFilter;
      return searchMatch && sexMatch;
    });
  }, [query, rows, sexFilter]);

  let active: { row: WeeklyLearnerRow; cell: WeeklyCell } | null = null;
  if (activeKey) {
    for (const row of rows) {
      const cell = row.days.find((day) => keyFor(row.enrolmentId, day.date) === activeKey);
      if (cell) { active = { row, cell }; break; }
    }
  }

  const payload = dates.map((date) => ({ date, client_mutation_id: mutationIds[date], replaces_submission_id: submissionIds[date] ?? null, exceptions: rows.flatMap((row) => {
    const cell = row.days.find((day) => day.date === date);
    return cell && cell.status !== "present" ? [{ enrolment_id: row.enrolmentId, status: cell.status, reason_id: cell.reasonId, note: cell.note }] : [];
  }) }));

  function updateCell(enrolmentId: string, date: string, changes: Partial<WeeklyCell>) {
    setRows((current) => current.map((row) => row.enrolmentId === enrolmentId ? { ...row, days: row.days.map((day) => day.date === date ? { ...day, ...changes } : day) } : row));
  }

  function activateCell(row: WeeklyLearnerRow, cell: WeeklyCell) {
    if (cell.status === "present") updateCell(row.enrolmentId, cell.date, { status: "absent", reasonId: null, note: null });
    setActiveKey(keyFor(row.enrolmentId, cell.date));
  }

  function setActiveStatus(status: "absent" | "late" | "excused") {
    if (!active) return;
    updateCell(active.row.enrolmentId, active.cell.date, { status });
  }

  function markActivePresent() {
    if (!active) return;
    updateCell(active.row.enrolmentId, active.cell.date, { status: "present", reasonId: null, note: null });
  }

  function navigateWeek(direction: -1 | 1) {
    if (!dates[0]) return;
    const classParam = selectedClassId ? `&class=${encodeURIComponent(selectedClassId)}` : "";
    startNavigation(() => router.replace(`/attendance?view=week&date=${shiftWeek(dates[0], direction)}${classParam}`, { scroll: false }));
  }

  function chooseClass(classId: string) {
    const date = dates[0] ?? new Date().toISOString().slice(0, 10);
    startNavigation(() => router.replace(`/attendance?view=week&class=${encodeURIComponent(classId)}&date=${date}`, { scroll: false }));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Picker label="Register class" name="weekly-class-ui" value={selectedClassId ?? ""} onChange={chooseClass} placeholder="Choose a class" options={classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))} className="max-w-xl" />
          <div><p className="text-xs font-medium text-muted-foreground lg:text-right">School week</p><div className="mt-1.5 flex items-center gap-1.5"><button type="button" disabled={navigationPending} onClick={() => navigateWeek(-1)} aria-label="Previous week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronLeft className="size-4" /></button><div className="relative min-w-0 flex-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium sm:min-w-48 sm:flex-none">{navigationPending ? <span className="absolute inset-0 grid place-items-center"><Spinner className="size-4 text-brand" /></span> : null}<span className={navigationPending ? "opacity-0" : ""}>{dates[0] && dates[4] ? `${new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short" }).format(new Date(`${dates[0]}T12:00:00`))} – ${new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${dates[4]}T12:00:00`))}` : "School week"}</span></div><button type="button" disabled={navigationPending} onClick={() => navigateWeek(1)} aria-label="Next week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronRight className="size-4" /></button></div></div>
        </div>
      </section>

      <form action={action} className="relative">
        <input type="hidden" name="registerClassId" value={selectedClassId ?? ""} /><input type="hidden" name="days" value={JSON.stringify(payload)} />
        <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:px-5">
            <div><h2 className="scolapro-section-title">Weekly register</h2><p className="scolapro-section-description">Everyone starts present. On phones, open a learner to show Monday–Friday. Tap a green tick to record an exception.</p></div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><label className="scolapro-control-surface flex min-h-10 w-full max-w-md items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner by name or number…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}</label><div className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]">{(["all", "male", "female"] as SexFilter[]).map((value) => <button key={value} type="button" onClick={() => setSexFilter(value)} className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium ${sexFilter === value ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"}`}>{value === "all" ? "All" : value === "male" ? "Boys" : "Girls"}</button>)}</div></div>
            <p className="mt-2 text-[0.68rem] text-muted-foreground">{filteredRows.length} of {rows.length} learners shown</p>
          </div>

          {!selectedClassId || !learners.length ? <div className="py-10 text-center"><p className="text-sm font-medium">No learners available for this register</p></div> : <>
            <div className="divide-y divide-border-subtle md:hidden">{filteredRows.map((row) => { const expanded = expandedMobileLearnerId === row.enrolmentId; return <div key={row.enrolmentId} className="px-4 py-2.5"><button type="button" onClick={() => setExpandedMobileLearnerId(expanded ? null : row.enrolmentId)} aria-expanded={expanded} className="flex min-h-11 w-full items-center justify-between gap-3 text-left"><div className="min-w-0"><p className="scolapro-record-title truncate">{row.name}</p><p className="text-[0.68rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></div>{expanded ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}</button>{expanded ? <div className="mt-2 grid grid-cols-5 gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted p-2">{row.days.map((cell) => { const style = presentation(cell.status); const Icon = style.icon; return <button key={cell.date} type="button" onClick={() => activateCell(row, cell)} aria-label={`${row.name}, ${cell.date}, ${style.label}`} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-xs)] ${style.classes}`}><span className="text-[0.62rem] font-medium opacity-75">{new Intl.DateTimeFormat("en-NA", { weekday: "narrow" }).format(new Date(`${cell.date}T12:00:00`))}</span><Icon className="size-4" strokeWidth={2.4} /></button>; })}</div> : null}</div>; })}</div>

            <div className="hidden overflow-x-auto border-b border-border-subtle md:block"><div className="min-w-[46rem]"><div className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(5,minmax(5.4rem,0.55fr))] bg-surface-muted px-3 py-2 text-[0.68rem] font-medium text-muted-foreground"><span>Learner</span>{dates.map((date) => <span key={date} className="text-center">{new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`))}</span>)}</div><div className="divide-y divide-border-subtle">{filteredRows.map((row) => <div key={row.enrolmentId} className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(5,minmax(5.4rem,0.55fr))] items-center px-3 py-2.5"><div className="min-w-0 pr-3"><p className="scolapro-record-title truncate">{row.name}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></div>{row.days.map((cell) => { const style = presentation(cell.status); const Icon = style.icon; return <button key={cell.date} type="button" onClick={() => activateCell(row, cell)} className={`mx-auto grid size-9 place-items-center rounded-[var(--radius-xs)] transition hover:scale-105 ${style.classes}`} data-tooltip={`${style.label} · click to edit`} aria-label={`${row.name}, ${cell.date}, ${style.label}`}><Icon className="size-4" strokeWidth={2.4} /></button>; })}</div>)}</div></div></div>

            <div className="flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-[0.7rem] text-muted-foreground">One confirmation creates separate auditable daily records for Monday–Friday.</p><button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : <Save className="size-4" />}{pending ? "Saving week…" : "Confirm week"}</button></div>
          </>}
        </section>

        {active ? <div className="fixed inset-0 z-[150] grid items-end bg-[color:var(--foreground)]/12 px-0 pb-[calc(4.75rem+env(safe-area-inset-bottom))] backdrop-blur-[1px] sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setActiveKey(""); }}>
          <div role="dialog" aria-modal="true" aria-label={`Attendance for ${active.row.name}`} className="max-h-[calc(100dvh-5.75rem)] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-border-subtle bg-surface shadow-[var(--shadow-sm)] sm:max-h-[88vh] sm:max-w-lg sm:rounded-[var(--radius-md)]">
            <div className="p-4 sm:p-5">
              <div className="sticky top-0 z-10 -mx-1 flex items-start justify-between gap-3 bg-surface px-1 pb-2"><div><p className="scolapro-section-title">{active.row.name}</p><p className="scolapro-section-description">{new Intl.DateTimeFormat("en-NA", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${active.cell.date}T12:00:00`))}</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => setActiveKey("")} aria-label="Done editing attendance" className="grid size-9 place-items-center rounded-[var(--radius-xs)] bg-success-soft text-[color:var(--success)] hover:brightness-95"><Check className="size-4" strokeWidth={2.6} /></button><button type="button" onClick={() => setActiveKey("")} aria-label="Close attendance editor" className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-4" /></button></div></div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">{(["absent", "late", "excused"] as const).map((status) => { const style = presentation(status); const Icon = style.icon; const selected = active?.cell.status === status; return <button key={status} type="button" onClick={() => setActiveStatus(status)} className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-xs)] px-2 py-2 text-[0.7rem] font-semibold ${selected ? `${style.classes} ring-1 ring-inset ring-current/20` : "bg-surface-muted text-muted-foreground"}`}>{selected ? <Icon className="size-4" strokeWidth={2.4} /> : null}{style.label}</button>; })}</div>
              <button type="button" onClick={markActivePresent} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--success)]"><Check className="size-3.5" />Mark present</button>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><Picker label="Reason" name={`weekly-reason-ui-${active.row.enrolmentId}-${active.cell.date}`} value={active.cell.reasonId ?? ""} onChange={(reasonId) => updateCell(active!.row.enrolmentId, active!.cell.date, { reasonId: reasonId || null })} placeholder="No reason" options={[{ value: "", label: "No reason" }, ...reasons.map((reason) => ({ value: reason.id, label: reason.name, helper: reason.sensitive ? "Restricted detail" : undefined }))]} /><div><label htmlFor="weekly-note" className="block text-xs font-medium">Note</label><input id="weekly-note" value={active.cell.note ?? ""} onChange={(event) => updateCell(active!.row.enrolmentId, active!.cell.date, { note: event.target.value })} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs shadow-[var(--shadow-xs)] outline-none placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/50" /></div></div>
              <div className="mt-3"><input id={`weekly-evidence-${active.row.enrolmentId}-${active.cell.date}`} name={`evidence-${active.row.enrolmentId}-${active.cell.date}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(event) => setEvidenceNames((current) => ({ ...current, [activeKey]: event.target.files?.[0]?.name ?? "" }))} /><label htmlFor={`weekly-evidence-${active.row.enrolmentId}-${active.cell.date}`} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-3 text-[0.7rem] font-medium text-muted-foreground hover:text-foreground"><Paperclip className="size-3.5" />{evidenceNames[activeKey] ? "Change evidence" : "Photo / evidence"}</label>{evidenceNames[activeKey] ? <span className="ml-2 break-all text-[0.68rem] text-muted-foreground">{evidenceNames[activeKey]}</span> : null}</div>
              <div className="mt-4 hidden justify-end sm:flex"><button type="button" onClick={() => setActiveKey("")} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong"><Check className="size-3.5" />Done</button></div>
            </div>
          </div>
        </div> : null}
      </form>
    </div>
  );
}
