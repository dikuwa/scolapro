"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, GraduationCap, Search, ShieldCheck, UsersRound, X } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import type { AbsenceOverviewClass, AbsenceOverviewRow } from "@/features/attendance/server/absence-overview";

type SourceFilter = "all" | "daily" | "lesson" | "guardian";

function schoolDayShift(date: string, direction: -1 | 1) {
  const current = new Date(`${date}T12:00:00`);
  do current.setDate(current.getDate() + direction); while (current.getDay() === 0 || current.getDay() === 6);
  return current.toISOString().slice(0, 10);
}

function SourceBadge({ source }: { source: AbsenceOverviewRow["source"] }) {
  const styles: Record<AbsenceOverviewRow["source"], string> = {
    daily: "bg-brand-soft text-brand-strong",
    lesson: "bg-info-soft text-[color:var(--info)]",
    guardian: "bg-warning-soft text-[color:var(--warning)]",
  };
  const labels: Record<AbsenceOverviewRow["source"], string> = { daily: "Daily register", lesson: "Lesson", guardian: "Guardian notice" };
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold capitalize ${styles[source]}`}>{labels[source]}</span>;
}

function reviewBadge(status: string | null) {
  if (!status) return null;
  const styles: Record<string, string> = {
    submitted: "bg-brand-soft text-brand-strong",
    under_review: "bg-warning-soft text-[color:var(--warning)]",
    accepted: "bg-success-soft text-[color:var(--success)]",
    returned: "bg-info-soft text-[color:var(--info)]",
    closed: "bg-surface-muted text-muted-foreground",
  };
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium capitalize ${styles[status] ?? "bg-surface-muted text-muted-foreground"}`}>{status.replace("_", " ")}</span>;
}

export function AbsenceOverview({
  classes,
  selectedClassId,
  rows,
  attendanceDate,
}: {
  classes: AbsenceOverviewClass[];
  selectedClassId: string | null;
  rows: AbsenceOverviewRow[];
  attendanceDate: string;
}) {
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => ({
    all: rows.length,
    daily: rows.filter((row) => row.source === "daily").length,
    lesson: rows.filter((row) => row.source === "lesson").length,
    guardian: rows.filter((row) => row.source === "guardian").length,
  }), [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const sourceMatch = sourceFilter === "all" || row.source === sourceFilter;
      const searchMatch = !needle || row.learnerName.toLowerCase().includes(needle) || (row.subjectName ?? "").toLowerCase().includes(needle);
      return sourceMatch && searchMatch;
    });
  }, [query, rows, sourceFilter]);

  function chooseClass(classId: string) {
    const params = new URLSearchParams();
    params.set("view", "absences");
    params.set("date", attendanceDate);
    if (classId) params.set("class", classId);
    startNavigation(() => router.replace(`/attendance?${params.toString()}`, { scroll: false }));
  }

  function moveDate(direction: -1 | 1) {
    const params = new URLSearchParams();
    params.set("view", "absences");
    params.set("date", schoolDayShift(attendanceDate, direction));
    if (selectedClassId) params.set("class", selectedClassId);
    startNavigation(() => router.replace(`/attendance?${params.toString()}`, { scroll: false }));
  }

  const filterTabs: { value: SourceFilter; label: string }[] = [
    { value: "all", label: `All (${counts.all})` },
    { value: "daily", label: `Daily (${counts.daily})` },
    { value: "lesson", label: `Lessons (${counts.lesson})` },
    { value: "guardian", label: `Guardian (${counts.guardian})` },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Picker label="Register class" name="absence-class-ui" value={selectedClassId ?? ""} onChange={chooseClass} placeholder="Whole school" options={[{ value: "", label: "Whole school" }, ...classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))]} className="max-w-xl" />
          <div>
            <p className="text-xs font-medium text-muted-foreground lg:text-right">Absence date</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <button type="button" disabled={navigationPending} onClick={() => moveDate(-1)} aria-label="Previous school day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronLeft className="size-4" /></button>
              <div className="relative min-w-0 flex-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium sm:min-w-40 sm:flex-none">{navigationPending ? <span className="absolute inset-0 grid place-items-center"><Spinner className="size-4 text-brand" /></span> : null}<span className={navigationPending ? "opacity-0" : ""}>{new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${attendanceDate}T12:00:00`))}</span></div>
              <button type="button" disabled={navigationPending} onClick={() => moveDate(1)} aria-label="Next school day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 className="scolapro-section-title">Absences on this day</h2><p className="scolapro-section-description">Signals combined from the official daily register, lesson registers and guardian notices. Nothing shown here changes those records — they are views over existing school data.</p></div>
            <div className="flex gap-2 text-xs"><span className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 py-1.5 font-medium text-brand-strong"><UsersRound className="size-3.5" aria-hidden="true" />{counts.all} signal{counts.all === 1 ? "" : "s"}</span></div>
          </div>
          <div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <label className="scolapro-control-surface flex min-h-10 w-full max-w-md items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner or subject…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}</label>
            <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)] sm:grid-cols-4">{filterTabs.map((tab) => <button key={tab.value} type="button" onClick={() => setSourceFilter(tab.value)} aria-pressed={sourceFilter === tab.value} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium transition ${sourceFilter === tab.value ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}</div>
          </div>
        </div>

        {!rows.length ? <div className="px-5 py-10 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><ShieldCheck className="size-5" aria-hidden="true" /></span><h3 className="mt-3 text-sm font-semibold">No absence signals for this day</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">No learner was recorded absent or excused on the daily register or in a lesson register, and no guardian notice covers this date.</p></div> : !visible.length ? <div className="px-5 py-10 text-center"><h3 className="text-sm font-semibold">No rows match your filters</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Change the source filter, search or register class to widen the list.</p></div> : (
          <ul className="max-h-[min(62vh,42rem)] divide-y divide-border-subtle overflow-y-auto overscroll-contain">
            {visible.map((row) => <li key={row.key} className="px-4 py-3.5 sm:px-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="scolapro-record-title">{row.learnerName}</span>{row.source === "guardian" ? <span className="inline-flex items-center gap-1 text-[0.66rem] font-medium text-muted-foreground"><FileText className="size-3" aria-hidden="true" />Parent notice</span> : row.className ? <span className="inline-flex items-center gap-1 text-[0.66rem] font-medium text-muted-foreground"><GraduationCap className="size-3" aria-hidden="true" />{row.gradeName ? `${row.gradeName} · ` : ""}{row.className}</span> : null}</div><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted-foreground"><span className="font-medium text-foreground">{row.status}</span>{row.source === "lesson" && row.subjectName ? <span>{row.subjectName}</span> : null}{row.reason ? <span>{row.reason}</span> : null}{row.note ? <span className="max-w-md truncate italic">{row.note}</span> : null}</p></div><div className="flex shrink-0 items-center gap-1.5"><SourceBadge source={row.source} />{row.source === "guardian" ? reviewBadge(row.reviewStatus) : null}</div></div></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
