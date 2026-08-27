"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import type { AttendanceClassOption, AttendanceReasonOption } from "@/features/attendance/server/register";
import { submitWeeklyRegister, type WeeklyRegisterState } from "@/features/attendance/server/week-actions";
import type { WeeklyCell, WeeklyLearnerRow } from "@/features/attendance/server/week";

const initialState: WeeklyRegisterState = {};
const statuses: { value: WeeklyCell["status"]; label: string; short: string }[] = [
  { value: "present", label: "Present", short: "P" },
  { value: "absent", label: "Absent", short: "A" },
  { value: "late", label: "Late", short: "L" },
  { value: "excused", label: "Excused", short: "E" },
];

function shiftWeek(date: string, weeks: number) {
  const current = new Date(`${date}T12:00:00`);
  current.setDate(current.getDate() + weeks * 7);
  return current.toISOString().slice(0, 10);
}

function keyFor(enrolmentId: string, date: string) { return `${enrolmentId}:${date}`; }

export function WeeklyRegister({ classes, selectedClassId, dates, learners, reasons, submissionIds }: { classes: AttendanceClassOption[]; selectedClassId: string | null; dates: string[]; learners: WeeklyLearnerRow[]; reasons: AttendanceReasonOption[]; submissionIds: Record<string, string> }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitWeeklyRegister, initialState);
  const [navigationPending, startNavigation] = useTransition();
  const [rows, setRows] = useState(learners);
  const [activeKey, setActiveKey] = useState(() => learners[0] && dates[0] ? keyFor(learners[0].enrolmentId, dates[0]) : "");
  const [query, setQuery] = useState("");
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [mutationIds] = useState(() => Object.fromEntries(dates.map((date) => [date, crypto.randomUUID()])));

  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [router, state]);

  useEffect(() => {
    if (!selectedClassId || !dates[0]) return;
    router.prefetch(`/attendance?view=week&class=${encodeURIComponent(selectedClassId)}&date=${shiftWeek(dates[0], -1)}`);
    router.prefetch(`/attendance?view=week&class=${encodeURIComponent(selectedClassId)}&date=${shiftWeek(dates[0], 1)}`);
  }, [dates, router, selectedClassId]);

  const filteredRows = rows.filter((row) => {
    const searchMatch = !query || `${row.name} ${row.admissionNumber ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return searchMatch && (!onlyExceptions || row.days.some((day) => day.status !== "present"));
  });

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
          <div><p className="text-xs font-medium text-muted-foreground lg:text-right">School week</p><div className="mt-1.5 flex items-center gap-1.5"><button type="button" disabled={navigationPending} onClick={() => navigateWeek(-1)} aria-label="Previous week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronLeft className="size-4" /></button><div className="relative min-w-48 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium">{navigationPending ? <span className="absolute inset-0 grid place-items-center bg-[color:var(--surface-muted)]"><Spinner className="size-4 text-brand" /></span> : null}{dates[0] && dates[4] ? `${new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short" }).format(new Date(`${dates[0]}T12:00:00`))} – ${new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${dates[4]}T12:00:00`))}` : "School week"}</div><button type="button" disabled={navigationPending} onClick={() => navigateWeek(1)} aria-label="Next week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronRight className="size-4" /></button></div></div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="-mx-4 -mt-4 border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:-mx-5 sm:-mt-5 sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="scolapro-section-title">Weekly register</h2><p className="scolapro-section-description">Monday to Friday only. Everyone starts present; edit exceptions per learner and day, then confirm once.</p></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => setOnlyExceptions(false)} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium ${!onlyExceptions ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground"}`}>All learners</button><button type="button" onClick={() => setOnlyExceptions(true)} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium ${onlyExceptions ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground"}`}>Exceptions</button></div></div><div className="mt-3 flex max-w-md items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/65" /></div></div>

        {!selectedClassId || !learners.length ? <div className="py-10 text-center"><p className="text-sm font-medium">No learners available for this register</p><p className="mt-1 text-xs text-muted-foreground">Choose a configured class with active enrolments.</p></div> : (
          <form action={action} className="mt-4"><input type="hidden" name="registerClassId" value={selectedClassId} /><input type="hidden" name="days" value={JSON.stringify(payload)} />
            <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><div className="min-w-[46rem]"><div className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(5,minmax(5.4rem,0.55fr))] bg-surface-muted px-3 py-2 text-[0.68rem] font-medium text-muted-foreground"><span>Learner</span>{dates.map((date) => <span key={date} className="text-center">{new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`))}</span>)}</div><div className="divide-y divide-border-subtle">{filteredRows.map((row) => <div key={row.enrolmentId} className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(5,minmax(5.4rem,0.55fr))] items-center px-3 py-2.5"><div className="min-w-0 pr-3"><p className="scolapro-record-title truncate">{row.name}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></div>{row.days.map((cell) => { const status = statuses.find((item) => item.value === cell.status) ?? statuses[0]; const selected = activeKey === keyFor(row.enrolmentId, cell.date); return <button key={cell.date} type="button" onClick={() => setActiveKey(keyFor(row.enrolmentId, cell.date))} className={`mx-auto grid min-h-9 min-w-12 place-items-center rounded-[var(--radius-xs)] px-2 text-xs font-semibold transition ${selected ? "ring-2 ring-[color:var(--brand)]/30" : ""} ${cell.status === "present" ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`} title={`${status.label} · edit`}>{status.short}</button>; })}</div>)}</div></div></div>

            {active ? <div className="mt-4 rounded-[var(--radius-md)] bg-surface-muted p-4"><div className="mb-3"><p className="scolapro-section-title">Edit attendance</p><p className="scolapro-section-description">{active.row.name} · {new Intl.DateTimeFormat("en-NA", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${active.cell.date}T12:00:00`))}</p></div><div className="flex flex-wrap gap-1.5">{statuses.map((status) => <button key={status.value} type="button" onClick={() => updateCell(active!.row.enrolmentId, active!.cell.date, { status: status.value, reasonId: status.value === "present" ? null : active!.cell.reasonId, note: status.value === "present" ? null : active!.cell.note })} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium ${active!.cell.status === status.value ? "bg-brand-soft text-brand-strong" : "bg-surface text-muted-foreground"}`}>{status.value === "present" && active!.cell.status === "present" ? <Check className="mr-1 inline size-3.5" /> : null}{status.label}</button>)}</div>{active.cell.status !== "present" ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Picker label="Reason" name="weekly-reason-ui" value={active.cell.reasonId ?? ""} onChange={(reasonId) => updateCell(active!.row.enrolmentId, active!.cell.date, { reasonId: reasonId || null })} placeholder="Reason (optional)" options={[{ value: "", label: "No reason" }, ...reasons.map((reason) => ({ value: reason.id, label: reason.name, helper: reason.sensitive ? "Restricted detail" : undefined }))]} /><div><label className="text-xs font-medium" htmlFor="weekly-note">Note</label><input id="weekly-note" value={active.cell.note ?? ""} onChange={(event) => updateCell(active!.row.enrolmentId, active!.cell.date, { note: event.target.value })} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></div></div> : null}</div> : null}

            <div className="sticky bottom-[4.5rem] -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-border-subtle bg-[color:var(--surface)]/96 px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:bottom-0"><p className="text-xs text-muted-foreground">One confirmation creates separate auditable daily records for Monday–Friday.</p><button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 shrink-0 items-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : <Save className="size-4" />}{pending ? "Saving week…" : "Confirm week"}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
