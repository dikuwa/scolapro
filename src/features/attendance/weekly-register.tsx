"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Clock3, Save, Search, ShieldCheck, X } from "lucide-react";
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

function cellPresentation(status: WeeklyStatus) {
  if (status === "absent") return { className: "bg-danger-soft text-[color:var(--danger)]", icon: <X className="size-4" aria-hidden="true" />, label: "Absent" };
  if (status === "late") return { className: "bg-warning-soft text-[color:var(--warning)]", icon: <Clock3 className="size-4" aria-hidden="true" />, label: "Late" };
  if (status === "excused") return { className: "bg-info-soft text-[color:var(--info)]", icon: <ShieldCheck className="size-4" aria-hidden="true" />, label: "Excused" };
  return { className: "bg-success-soft text-[color:var(--success)]", icon: <Check className="size-4" aria-hidden="true" />, label: "Present" };
}

export function WeeklyRegister({ classes, selectedClassId, dates, learners, reasons, submissionIds }: { classes: AttendanceClassOption[]; selectedClassId: string | null; dates: string[]; learners: WeeklyLearnerRow[]; reasons: AttendanceReasonOption[]; submissionIds: Record<string, string> }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitWeeklyRegister, initialState);
  const [navigationPending, startNavigation] = useTransition();
  const [rows, setRows] = useState(learners);
  const [activeKey, setActiveKey] = useState("");
  const [query, setQuery] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("all");
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
      const sex = (row.sex ?? "").toLowerCase();
      return searchMatch && (sexFilter === "all" || sex === sexFilter);
    });
  }, [query, rows, sexFilter]);

  let active: { row: WeeklyLearnerRow; cell: WeeklyCell } | null = null;
  if (activeKey) {
    for (const row of rows) {
      const cell = row.days.find((day) => keyFor(row.enrolmentId, day.date) === activeKey);
      if (cell) { active = { row, cell }; break; }
    }
  }

  const payload = dates.map((date) => ({
    date,
    client_mutation_id: mutationIds[date],
    replaces_submission_id: submissionIds[date] ?? null,
    exceptions: rows.flatMap((row) => {
      const cell = row.days.find((day) => day.date === date);
      return cell && cell.status !== "present" ? [{ enrolment_id: row.enrolmentId, status: cell.status, reason_id: cell.reasonId, note: cell.note }] : [];
    }),
  }));

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
    setActiveKey("");
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
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Picker label="Register class" name="weekly-class-ui" value={selectedClassId ?? ""} onChange={chooseClass} placeholder="Choose a class" options={classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))} className="max-w-xl" />
          <div><p className="text-xs font-medium text-muted-foreground lg:text-right">School week</p><div className="mt-1.5 flex items-center gap-1.5"><button type="button" disabled={navigationPending} onClick={() => navigateWeek(-1)} aria-label="Previous week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronLeft className="size-4" /></button><div className="relative min-w-48 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium">{navigationPending ? <span className="absolute inset-0 grid place-items-center bg-[color:var(--surface-muted)]"><Spinner className="size-4 text-brand" /></span> : null}{dates[0] && dates[4] ? `${new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short" }).format(new Date(`${dates[0]}T12:00:00`))} – ${new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${dates[4]}T12:00:00`))}` : "School week"}</div><button type="button" disabled={navigationPending} onClick={() => navigateWeek(1)} aria-label="Next week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronRight className="size-4" /></button></div></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-sm)]">
        <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:px-5">
          <div><h2 className="scolapro-section-title">Weekly register</h2><p className="scolapro-section-description">Everyone starts present. Click a green tick once to mark an exception, then choose absent, late or excused.</p></div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="scolapro-control-surface flex min-h-10 w-full max-w-md items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner by name or number…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}</label>
            <div className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]">{(["all", "male", "female"] as SexFilter[]).map((value) => <button key={value} type="button" onClick={() => setSexFilter(value)} className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium ${sexFilter === value ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"}`}>{value === "all" ? "All" : value === "male" ? "Boys" : "Girls"}</button>)}</div>
          </div>
          <p className="mt-2 text-[0.68rem] text-muted-foreground">{filteredRows.length} of {rows.length} learners shown</p>
        </div>

        {!selectedClassId || !learners.length ? <div className="py-10 text-center"><p className="text-sm font-medium">No learners available for this register</p><p className="mt-1 text-xs text-muted-foreground">Choose a configured class with active enrolments.</p></div> : (
          <form action={action}>
            <input type="hidden" name="registerClassId" value={selectedClassId} /><input type="hidden" name="days" value={JSON.stringify(payload)} />
            <div className="overflow-x-auto border-b border-border-subtle"><div className="min-w-[46rem]"><div className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(5,minmax(5.4rem,0.55fr))] bg-surface-muted px-3 py-2 text-[0.68rem] font-medium text-muted-foreground"><span>Learner</span>{dates.map((date) => <span key={date} className="text-center">{new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`))}</span>)}</div><div className="divide-y divide-border-subtle">{filteredRows.map((row) => <div key={row.enrolmentId} className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(5,minmax(5.4rem,0.55fr))] items-center px-3 py-2.5"><div className="min-w-0 pr-3"><p className="scolapro-record-title truncate">{row.name}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></div>{row.days.map((cell) => { const presentation = cellPresentation(cell.status); const selected = activeKey === keyFor(row.enrolmentId, cell.date); return <button key={cell.date} type="button" onClick={() => activateCell(row, cell)} className={`mx-auto grid size-9 place-items-center rounded-[var(--radius-xs)] transition ${presentation.className} ${selected ? "ring-2 ring-[color:var(--brand)]/30 ring-offset-2 ring-offset-[color:var(--surface)]" : "hover:scale-105"}`} title={`${presentation.label} · click to edit`} aria-label={`${row.name}, ${cell.date}, ${presentation.label}`}>{presentation.icon}</button>; })}</div>)}</div></div></div>
            <div className="sticky bottom-[4.5rem] flex items-center justify-between gap-3 bg-[color:var(--surface)]/96 px-4 py-3 backdrop-blur-xl sm:px-5 lg:bottom-0"><p className="text-xs text-muted-foreground">One confirmation creates separate auditable daily records for Monday–Friday.</p><button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 shrink-0 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : <Save className="size-4" />}{pending ? "Saving week…" : "Confirm week"}</button></div>
          </form>
        )}
      </section>

      {active ? <div className="fixed inset-0 z-[80] grid place-items-center bg-[color:var(--foreground)]/12 p-4 backdrop-blur-[1px]" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setActiveKey(""); }}>
        <div role="dialog" aria-modal="true" aria-label={`Attendance for ${active.row.name}`} className="w-full max-w-lg rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-md)] sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="scolapro-section-title">{active.row.name}</p><p className="scolapro-section-description">{new Intl.DateTimeFormat("en-NA", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${active.cell.date}T12:00:00`))}</p></div><button type="button" onClick={() => setActiveKey("")} aria-label="Close attendance editor" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-4" /></button></div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setActiveStatus("absent")} className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-semibold ${active.cell.status === "absent" ? "bg-danger-soft text-[color:var(--danger)]" : "bg-surface-muted text-muted-foreground"}`}>Absent</button>
            <button type="button" onClick={() => setActiveStatus("late")} className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-semibold ${active.cell.status === "late" ? "bg-warning-soft text-[color:var(--warning)]" : "bg-surface-muted text-muted-foreground"}`}>Late</button>
            <button type="button" onClick={() => setActiveStatus("excused")} className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-semibold ${active.cell.status === "excused" ? "bg-info-soft text-[color:var(--info)]" : "bg-surface-muted text-muted-foreground"}`}>Excused</button>
            <button type="button" onClick={markActivePresent} className="ml-auto inline-flex min-h-7 items-center gap-1 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--success)]"><Check className="size-3" />Mark present</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end"><div><label htmlFor="weekly-reason" className="block text-xs font-medium">Reason</label><select id="weekly-reason" value={active.cell.reasonId ?? ""} onChange={(event) => updateCell(active.row.enrolmentId, active.cell.date, { reasonId: event.target.value || null })} className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs shadow-[var(--shadow-xs)] outline-none"><option value="">No reason</option>{reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></div><div><label htmlFor="weekly-note" className="block text-xs font-medium">Note</label><input id="weekly-note" value={active.cell.note ?? ""} onChange={(event) => updateCell(active.row.enrolmentId, active.cell.date, { note: event.target.value })} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs shadow-[var(--shadow-xs)] outline-none placeholder:text-muted-foreground/65" /></div></div>
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => setActiveKey("")} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong"><Check className="size-3.5" />Done</button></div>
        </div>
      </div> : null}
    </div>
  );
}
