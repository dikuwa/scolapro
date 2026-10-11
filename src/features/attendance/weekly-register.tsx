"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Check, ChevronDown, ChevronUp, Paperclip, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { WeekPicker } from "@/components/ui/week-picker";
import { AttendanceSortControl, type AttendanceSortDirection } from "@/features/attendance/attendance-sort-control";
import { sortRegisterRowsBySurname } from "@/features/attendance/daily-register-view-state";
import {
  buildWeeklyAttendancePayload,
  weeklyAttendanceViewIdentity,
  weeklyCellForDate,
  weeklyRowsMatchDates,
} from "@/features/attendance/attendance-date-integrity";
import {
  buildAttendanceNavigationHref,
  formatAttendanceDate,
  mondayForAttendanceDate,
  shiftAttendanceWeek,
  type AttendanceNavigationSex,
} from "@/features/attendance/attendance-navigation";
import type { AttendanceClassOption, AttendanceReasonOption } from "@/features/attendance/server/register";
import type { AttendanceCalendarNavigation } from "@/features/attendance/server/calendar-navigation";
import { submitWeeklyRegister, type WeeklyRegisterState } from "@/features/attendance/server/week-actions";
import type { WeeklyCell, WeeklyLearnerRow } from "@/features/attendance/server/week";

const initialState: WeeklyRegisterState = {};
type SexFilter = "all" | "male" | "female";
type WeeklyStatus = WeeklyCell["status"];

const weeklyStatuses = [
  { value: "present" as const, label: "Present" },
  { value: "absent" as const, label: "Absent" },
];

function keyFor(enrolmentId: string, date: string) { return `${enrolmentId}:${date}`; }

// Official weekly register vocabulary: Present/Absent only. Late arrivals and
// excused history stay operational and are never official register states.
function presentation(status: WeeklyStatus) {
  if (status === "absent") return { classes: "bg-danger-soft text-[color:var(--danger)]", icon: X, label: "Absent" };
  return { classes: "bg-success-soft text-[color:var(--success)]", icon: Check, label: "Present" };
}

function mutationIdsFor(dates: readonly string[]) {
  return Object.fromEntries(dates.map((date) => [date, crypto.randomUUID()]));
}

export function WeeklyRegister({ classes, selectedClassId, weekStart, weekEnd, dates, learners, reasons, submissionIds, nonTeachingDates, nonTeachingReasons, calendarNavigation, initialSort = "asc", initialSexFilter = "all" }: {
  classes: AttendanceClassOption[];
  selectedClassId: string | null;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  learners: WeeklyLearnerRow[];
  reasons: AttendanceReasonOption[];
  submissionIds: Record<string, string>;
  nonTeachingDates: string[];
  nonTeachingReasons: Record<string, string>;
  calendarNavigation: AttendanceCalendarNavigation;
  initialSort?: AttendanceSortDirection;
  initialSexFilter?: AttendanceNavigationSex;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitWeeklyRegister, initialState);
  const [navigationPending, startNavigation] = useTransition();
  const viewIdentity = weeklyAttendanceViewIdentity({ registerClassId: selectedClassId, weekStart, weekEnd, dates });
  const [draft, setDraft] = useState(() => ({
    viewIdentity,
    rows: learners,
    mutationIds: mutationIdsFor(dates),
  }));
  const [activeKey, setActiveKey] = useState("");
  const [expandedMobileLearnerId, setExpandedMobileLearnerId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>(initialSexFilter);
  const [sortDirection, setSortDirection] = useState<AttendanceSortDirection>(initialSort);
  const [evidenceNames, setEvidenceNames] = useState<Record<string, string>>({});
  if (draft.viewIdentity !== viewIdentity) {
    setDraft({ viewIdentity, rows: learners, mutationIds: mutationIdsFor(dates) });
    setActiveKey("");
    setExpandedMobileLearnerId(null);
    setEvidenceNames({});
  }
  const draftMatchesView = draft.viewIdentity === viewIdentity && weeklyRowsMatchDates(draft.rows, dates);
  const rows = draftMatchesView ? draft.rows : learners;

  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [router, state]);

  useEffect(() => {
    router.prefetch(buildAttendanceNavigationHref({ view: "day", date: weekStart, classId: selectedClassId, sort: sortDirection, sex: sexFilter }));
    if (!selectedClassId) return;
    router.prefetch(buildAttendanceNavigationHref({ view: "week", classId: selectedClassId, date: shiftAttendanceWeek(weekStart, -1), sort: sortDirection, sex: sexFilter }));
    router.prefetch(buildAttendanceNavigationHref({ view: "week", classId: selectedClassId, date: shiftAttendanceWeek(weekStart, 1), sort: sortDirection, sex: sexFilter }));
  }, [router, selectedClassId, sexFilter, sortDirection, weekStart]);

  // Sorting is a pure view projection over the draft rows, so A–Z / Z–A never
  // discards unsaved attendance edits or reorders the submit payload.
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = rows.filter((row) => {
      const searchMatch = !needle || (
        `${row.name} ${row.admissionNumber ?? ""}`.toLowerCase().includes(needle) ||
        `${row.nameAlternate} ${row.admissionNumber ?? ""}`.toLowerCase().includes(needle)
      );
      const sexMatch = sexFilter === "all" || (row.sex ?? "").toLowerCase() === sexFilter;
      return searchMatch && sexMatch;
    });
    return sortRegisterRowsBySurname(visible, sortDirection);
  }, [query, rows, sexFilter, sortDirection]);

  let active: { row: WeeklyLearnerRow; cell: WeeklyCell } | null = null;
  if (activeKey && draftMatchesView && !navigationPending) {
    for (const row of rows) {
      const cell = row.days.find((day) => keyFor(row.enrolmentId, day.date) === activeKey);
      if (cell) { active = { row, cell }; break; }
    }
  }

  // Non-teaching days are excluded from the payload entirely so a confirmation
  // never submits a register column for a date the calendar marks NO_TEACHING.
  const payload = draftMatchesView
    ? buildWeeklyAttendancePayload({
        dates,
        rows,
        nonTeachingDates,
        mutationIds: draft.mutationIds,
        submissionIds,
      })
    : null;
  const payloadDays = payload ?? [];
  const integrityReady = draftMatchesView && payload !== null;
  const hasUnsavedChanges = useMemo(() => {
    if (Object.values(evidenceNames).some(Boolean) || rows.length !== learners.length) return true;
    const initialById = new Map(learners.map((row) => [row.enrolmentId, row] as const));
    return rows.some((row) => {
      const initial = initialById.get(row.enrolmentId);
      if (!initial || row.days.length !== initial.days.length) return true;
      const initialDays = new Map(initial.days.map((day) => [day.date, day] as const));
      return row.days.some((day) => {
        const original = initialDays.get(day.date);
        return !original
          || day.status !== original.status
          || day.reasonId !== original.reasonId
          || day.note !== original.note;
      });
    });
  }, [evidenceNames, learners, rows]);

  function updateCell(enrolmentId: string, date: string, changes: Partial<WeeklyCell>) {
    if (!integrityReady || navigationPending || !dates.includes(date)) return;
    setDraft((current) => current.viewIdentity !== viewIdentity ? current : {
      ...current,
      rows: current.rows.map((row) => row.enrolmentId === enrolmentId
        ? { ...row, days: row.days.map((day) => day.date === date ? { ...day, ...changes } : day) }
        : row),
    });
  }

  function activateCell(row: WeeklyLearnerRow, date: string) {
    if (!integrityReady || navigationPending || isNonTeaching(date) || !weeklyCellForDate(row, date)) return;
    setActiveKey(keyFor(row.enrolmentId, date));
  }

  function isNonTeaching(date: string) {
    return nonTeachingDates.includes(date);
  }

  function nonTeachingReason(date: string) {
    return nonTeachingReasons[date] ?? "Non-teaching day in the school calendar";
  }

  function setActiveStatus(status: WeeklyStatus) {
    if (!active) return;
    updateCell(active.row.enrolmentId, active.cell.date, {
      status,
      reasonId: status === "present" ? null : active.cell.reasonId,
      note: status === "present" ? null : active.cell.note,
    });
  }

  function startRegisterNavigation(href: string) {
    setActiveKey("");
    setExpandedMobileLearnerId(null);
    startNavigation(() => router.replace(href, { scroll: false }));
  }

  function requestRegisterNavigation(href: string) {
    if (!hasUnsavedChanges) {
      startRegisterNavigation(href);
      return;
    }
    toast.warning("Unsaved attendance changes", {
      description: "Save this register, or discard the draft to continue navigating.",
      action: { label: "Discard and continue", onClick: () => startRegisterNavigation(href) },
    });
  }

  function navigateToWeek(date: string) {
    const href = buildAttendanceNavigationHref({
      view: "week",
      classId: selectedClassId,
      date,
      sort: sortDirection,
      sex: sexFilter,
    });
    if (mondayForAttendanceDate(date) === weekStart || navigationPending) return;
    requestRegisterNavigation(href);
  }

  // Week and class navigation keep the learner order and filters the user
  // chose, mirroring the daily register so the roster never re-sorts.
  function navigateWeek(direction: -1 | 1) {
    navigateToWeek(shiftAttendanceWeek(weekStart, direction));
  }

  function chooseClass(classId: string) {
    if (classId === selectedClassId || navigationPending) return;
    requestRegisterNavigation(buildAttendanceNavigationHref({
      view: "week",
      classId,
      date: weekStart,
      sort: sortDirection,
      sex: sexFilter,
    }));
  }

  function chooseSort(next: AttendanceSortDirection) {
    setSortDirection(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "asc") url.searchParams.delete("sort");
    else url.searchParams.set("sort", "desc");
    window.history.replaceState(window.history.state, "", url);
  }

  function chooseSexFilter(next: SexFilter) {
    setSexFilter(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("sex");
    else url.searchParams.set("sex", next);
    window.history.replaceState(window.history.state, "", url);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (integrityReady && !navigationPending) return;
    event.preventDefault();
    toast.error("The attendance week changed before this register could be saved. Refresh and try again.");
  }

  function renderMobileCell(row: WeeklyLearnerRow, date: string) {
    const cell = weeklyCellForDate(row, date);
    if (!cell) return <span key={date} className="flex min-h-12 items-center justify-center rounded-[var(--radius-xs)] bg-danger-soft text-[color:var(--danger)]" aria-label={`${row.name}, ${date}, unavailable`}>—</span>;
    const style = presentation(cell.status);
    const Icon = style.icon;
    return isNonTeaching(date)
      ? <span key={date} title={nonTeachingReason(date)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-xs)] bg-surface text-muted-foreground/50"><span className="text-[0.62rem] font-medium">{new Intl.DateTimeFormat("en-NA", { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</span><CalendarOff className="size-4" strokeWidth={2} /></span>
      : <button key={date} type="button" disabled={!integrityReady || navigationPending} onClick={() => activateCell(row, date)} aria-label={`${row.name}, ${date}, ${style.label}`} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-xs)] disabled:cursor-not-allowed disabled:opacity-60 ${style.classes}`}><span className="text-[0.62rem] font-medium opacity-75">{new Intl.DateTimeFormat("en-NA", { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</span><Icon className="size-4" strokeWidth={2.4} /></button>;
  }

  function renderDesktopCell(row: WeeklyLearnerRow, date: string) {
    const cell = weeklyCellForDate(row, date);
    if (!cell) return <span key={date} className="mx-auto grid size-9 place-items-center rounded-[var(--radius-xs)] bg-danger-soft text-[color:var(--danger)]" aria-label={`${row.name}, ${date}, unavailable`}>—</span>;
    const style = presentation(cell.status);
    const Icon = style.icon;
    return isNonTeaching(date)
      ? <span key={date} title={nonTeachingReason(date)} className="mx-auto grid size-9 place-items-center rounded-[var(--radius-xs)] bg-surface text-muted-foreground/40" aria-hidden="true"><CalendarOff className="size-4" strokeWidth={2} /></span>
      : <button key={date} type="button" disabled={!integrityReady || navigationPending} onClick={() => activateCell(row, date)} className={`mx-auto grid size-9 place-items-center rounded-[var(--radius-xs)] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 ${style.classes}`} data-tooltip={`${style.label} · click to edit`} aria-label={`${row.name}, ${date}, ${style.label}`}><Icon className="size-4" strokeWidth={2.4} /></button>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Picker label="Register class" name="weekly-class-ui" value={selectedClassId ?? ""} onChange={chooseClass} placeholder="Choose a class" options={classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))} className="max-w-xl" />
          <div><p className="text-xs font-medium text-muted-foreground lg:text-right">School week</p><WeekPicker className="mt-1.5 sm:min-w-60" valueLabel={`${formatAttendanceDate(weekStart, { day: "numeric", month: "short" })} – ${formatAttendanceDate(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`} onPrevious={() => navigateWeek(-1)} onNext={() => navigateWeek(1)} previousLabel="Previous week" nextLabel="Next week" pending={navigationPending} calendar={{ value: weekStart, onChange: navigateToWeek, label: "Choose school week", min: calendarNavigation.minDate, max: calendarNavigation.maxDate, rangeStart: weekStart, rangeEnd: weekEnd, getDateStatus: (date) => { const day = calendarNavigation.dayStates[date]; if (!day || day.kind === "teaching") return null; return { label: day.reason ?? (day.kind === "out_of_term" ? "Outside learner term" : "Attendance unavailable"), tone: day.kind === "out_of_term" ? "muted" : "warning" }; } }} /></div>
        </div>
      </section>

      <form action={action} onSubmit={handleSubmit} className="relative">
        <input type="hidden" name="registerClassId" value={selectedClassId ?? ""} />
        <input type="hidden" name="viewRegisterClassId" value={selectedClassId ?? ""} />
        <input type="hidden" name="weekStart" value={weekStart} />
        <input type="hidden" name="weekEnd" value={weekEnd} />
        <input type="hidden" name="days" value={JSON.stringify(payloadDays)} />
        <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:px-5">
            <div><h2 className="scolapro-section-title">Weekly register</h2><p className="scolapro-section-description">Everyone starts present. Open a learner and mark only official full-day absences; add the justification as a reason or evidence.{nonTeachingDates.length ? <span className="mt-1.5 block text-[color:var(--warning)]"><CalendarOff className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />{nonTeachingDates.length === 1 ? "One day this week is" : `${nonTeachingDates.length} days this week are`} marked non-teaching and can&apos;t be edited.</span> : null}</p></div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><label className="scolapro-control-surface flex min-h-10 w-full max-w-md items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner by name or number…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}</label><div className="flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]"><div className="grid grid-cols-3 gap-1">{(["all", "male", "female"] as SexFilter[]).map((value) => <button key={value} type="button" aria-pressed={sexFilter === value} onClick={() => chooseSexFilter(value)} className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium ${sexFilter === value ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"}`}>{value === "all" ? "All" : value === "male" ? "Boys" : "Girls"}</button>)}</div><span className="h-5 w-px bg-border-subtle" aria-hidden="true" /><AttendanceSortControl sort={sortDirection} onChange={chooseSort} /></div></div>
            <p className="mt-2 text-[0.68rem] text-muted-foreground">{filteredRows.length} of {rows.length} learners shown</p>
          </div>

          {!dates.length ? <div className="px-5 py-12 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><CalendarOff className="size-5" aria-hidden="true" /></span><p className="mt-3 text-sm font-semibold">No teaching days this week</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">This week falls outside the governed learner term. Attendance cannot be entered or confirmed, but week navigation remains available.</p></div> : !selectedClassId || !learners.length ? <div className="py-10 text-center"><p className="text-sm font-medium">No learners available for this register</p></div> : <>
            <div className="max-h-[min(62vh,42rem)] divide-y divide-border-subtle overflow-y-auto overscroll-contain md:hidden">{filteredRows.map((row) => { const expanded = expandedMobileLearnerId === row.enrolmentId; return <div key={row.enrolmentId} className="px-4 py-2.5"><button type="button" disabled={navigationPending} onClick={() => setExpandedMobileLearnerId(expanded ? null : row.enrolmentId)} aria-expanded={expanded} className="flex min-h-11 w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"><span className="flex min-w-0 items-baseline gap-2"><span className="scolapro-record-title min-w-0 truncate">{row.name}</span><span className="shrink-0 text-[0.68rem] font-normal text-muted-foreground">{row.admissionNumber ?? "No admission number"}</span></span>{expanded ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}</button>{expanded ? <div className="mt-2 grid grid-cols-5 gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted p-2">{dates.map((date) => renderMobileCell(row, date))}</div> : null}</div>; })}</div>

            <div className="hidden max-h-[min(62vh,42rem)] overflow-auto overscroll-contain border-b border-border-subtle md:block"><div className="min-w-[46rem]"><div className="sticky top-0 z-10 grid border-b border-border-subtle bg-surface-muted px-3 py-2 text-[0.68rem] font-medium text-muted-foreground" style={{ gridTemplateColumns: `minmax(12rem,1.2fr) repeat(${dates.length},minmax(5.4rem,.55fr))` }}><span>Learner</span>{dates.map((date) => isNonTeaching(date) ? <span key={date} title={nonTeachingReason(date)} className="flex items-center justify-center gap-1 text-center text-[color:var(--warning)]"><CalendarOff className="size-3" aria-hidden="true" />{new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`))}</span> : <span key={date} className="text-center">{new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`))}</span>)}</div><div className="divide-y divide-border-subtle">{filteredRows.map((row) => <div key={row.enrolmentId} className="grid items-center px-3 py-2.5" style={{ gridTemplateColumns: `minmax(12rem,1.2fr) repeat(${dates.length},minmax(5.4rem,.55fr))` }}><div className="min-w-0 pr-3"><span className="flex min-w-0 items-baseline gap-2"><span className="scolapro-record-title min-w-0 truncate">{row.name}</span><span className="shrink-0 text-[0.68rem] font-normal text-muted-foreground">{row.admissionNumber ?? "No admission number"}</span></span></div>{dates.map((date) => renderDesktopCell(row, date))}</div>)}</div></div></div>

            <div className="flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-[0.7rem] text-muted-foreground">One confirmation creates separate auditable daily records for Monday–Friday.</p><button type="submit" disabled={pending || navigationPending || !integrityReady || payloadDays.length === 0} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : payloadDays.length === 0 ? "No capture days this week" : "Confirm week"}</button></div>
          </>}
        </section>

        {active ? <div className="fixed inset-0 z-[150] flex items-end justify-center bg-[color:var(--foreground)]/12 px-0 pb-[calc(4.75rem+env(safe-area-inset-bottom))] backdrop-blur-[1px] sm:items-center sm:justify-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setActiveKey(""); }}>
          <div role="dialog" aria-modal="true" aria-label={`Attendance for ${active.row.name}`} className="max-h-[calc(100dvh-5.75rem)] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-border-subtle bg-surface shadow-[var(--shadow-sm)] sm:max-h-[88vh] sm:max-w-lg sm:rounded-[var(--radius-md)]">
            <div className="p-4 sm:p-5">
              <div className="sticky top-0 z-10 -mx-1 flex items-start justify-between gap-3 bg-surface px-1 pb-2"><div><p className="scolapro-section-title">{active.row.name}</p><p className="scolapro-section-description">{new Intl.DateTimeFormat("en-NA", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${active.cell.date}T12:00:00`))}</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => setActiveKey("")} aria-label="Done editing attendance" className="grid size-9 place-items-center rounded-[var(--radius-xs)] bg-success-soft text-[color:var(--success)] ring-1 ring-inset ring-[color:var(--success)]/20 hover:brightness-95"><Check className="size-4" strokeWidth={2.6} /></button><button type="button" onClick={() => setActiveKey("")} aria-label="Close attendance editor" className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-4" /></button></div></div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:ml-auto sm:max-w-md">{weeklyStatuses.map((status) => { const style = presentation(status.value); const Icon = style.icon; const selected = active?.cell.status === status.value; return <button key={status.value} type="button" onClick={() => setActiveStatus(status.value)} aria-pressed={selected} className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-xs)] px-2 py-2 text-[0.7rem] font-semibold transition ${selected ? `${style.classes} ring-1 ring-inset ring-current/25` : "bg-surface-muted text-muted-foreground hover:bg-surface-subtle hover:text-foreground"}`}>{selected ? <Icon className="size-4" strokeWidth={2.4} /> : null}{status.label}</button>; })}</div>
              {active.cell.status === "present" ? <p className="mt-3 rounded-[var(--radius-sm)] bg-success-soft px-3 py-2.5 text-xs font-medium text-[color:var(--success)]">Present selected. Choose another status above to record an exception.</p> : <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2"><Picker label="Reason" name={`weekly-reason-ui-${active.row.enrolmentId}-${active.cell.date}`} value={active.cell.reasonId ?? ""} onChange={(reasonId) => updateCell(active!.row.enrolmentId, active!.cell.date, { reasonId: reasonId || null })} placeholder="No reason" options={[{ value: "", label: "No reason" }, ...reasons.map((reason) => ({ value: reason.id, label: reason.name, helper: reason.sensitive ? "Restricted detail" : undefined }))]} /><div><label htmlFor="weekly-note" className="block text-xs font-medium">Note</label><input id="weekly-note" value={active.cell.note ?? ""} onChange={(event) => updateCell(active!.row.enrolmentId, active!.cell.date, { note: event.target.value })} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs shadow-[var(--shadow-xs)] outline-none placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/50" /></div></div>
                <div className="mt-3"><input id={`weekly-evidence-${active.row.enrolmentId}-${active.cell.date}`} name={`evidence-${active.row.enrolmentId}-${active.cell.date}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(event) => setEvidenceNames((current) => ({ ...current, [activeKey]: event.target.files?.[0]?.name ?? "" }))} /><label htmlFor={`weekly-evidence-${active.row.enrolmentId}-${active.cell.date}`} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-3 text-[0.7rem] font-medium text-muted-foreground hover:text-foreground"><Paperclip className="size-3.5" />{evidenceNames[activeKey] ? "Change evidence" : "Photo / evidence"}</label>{evidenceNames[activeKey] ? <span className="ml-2 break-all text-[0.68rem] text-muted-foreground">{evidenceNames[activeKey]}</span> : null}</div>
              </>}
              <div className="mt-4 hidden justify-end sm:flex"><button type="button" onClick={() => setActiveKey("")} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong"><Check className="size-3.5" />Done</button></div>
            </div>
          </div>
        </div> : null}
      </form>
    </div>
  );
}
