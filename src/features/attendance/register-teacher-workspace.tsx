"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, FileText, UsersRound } from "lucide-react";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { WeekPicker } from "@/components/ui/week-picker";
import type { AttendanceClassOption } from "@/features/attendance/server/register";
import type { RegisterTeacherTermOption } from "@/features/attendance/server/register-teacher-document";

export function RegisterTeacherWorkspace({
  classes,
  selectedClassId,
  date,
  mode,
  weeklySubmittedDays,
  weeklyExpectedDays,
  terms,
  selectedTermId,
  fromWeek,
  toWeek,
}: {
  classes: AttendanceClassOption[];
  selectedClassId: string | null;
  date: string;
  mode: "week" | "range" | "term";
  weeklySubmittedDays: number;
  weeklyExpectedDays: number;
  terms: RegisterTeacherTermOption[];
  selectedTermId: string | null;
  fromWeek: string | null;
  toWeek: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const selectedTerm = terms.find((item) => item.id === selectedTermId) ?? null;

  function mondayFor(value: string) {
    const current = new Date(`${value}T12:00:00`);
    const day = current.getDay();
    current.setDate(current.getDate() + (day === 0 ? -6 : 1 - day));
    return current.toISOString().slice(0, 10);
  }

  function addDays(value: string, days: number) {
    const current = new Date(`${value}T12:00:00`);
    current.setDate(current.getDate() + days);
    return current.toISOString().slice(0, 10);
  }

  const weekOptions = (() => {
    if (!selectedTerm?.startsOn || !selectedTerm.endsOn) return [];
    const options: { value: string; label: string; helper: string }[] = [];
    const first = mondayFor(selectedTerm.startsOn);
    const last = mondayFor(selectedTerm.endsOn);
    for (let value = first, index = 1; value <= last; value = addDays(value, 7), index += 1) {
      const visibleStart = value < selectedTerm.startsOn ? selectedTerm.startsOn : value;
      const friday = addDays(value, 4);
      const visibleEnd = friday > selectedTerm.endsOn ? selectedTerm.endsOn : friday;
      options.push({ value, label: `Week ${index}`, helper: `${visibleStart} – ${visibleEnd}` });
    }
    return options;
  })();
  const selectedFromWeek = fromWeek && weekOptions.some((item) => item.value === fromWeek)
    ? fromWeek
    : weekOptions.find((item) => item.value === mondayFor(date))?.value ?? weekOptions[0]?.value ?? null;
  const selectedToWeek = toWeek && weekOptions.some((item) => item.value === toWeek)
    ? toWeek
    : selectedFromWeek;
  const selectedWeekIndex = weekOptions.findIndex((item) => item.value === selectedFromWeek);

  function navigate(next: { classId?: string; mode?: "week" | "range" | "term"; termId?: string | null; date?: string; fromWeek?: string | null; toWeek?: string | null }) {
    const params = new URLSearchParams();
    params.set("view", "register");
    params.set("date", next.date ?? date);
    params.set("mode", next.mode ?? mode);
    if (next.classId ?? selectedClassId) params.set("class", next.classId ?? selectedClassId ?? "");
    const termId = next.termId === undefined ? selectedTermId : next.termId;
    if (termId) params.set("term", termId);
    const nextFrom = next.fromWeek === undefined ? selectedFromWeek : next.fromWeek;
    const nextTo = next.toWeek === undefined ? selectedToWeek : next.toWeek;
    if (nextFrom && (next.mode ?? mode) !== "term") params.set("fromWeek", nextFrom);
    if (nextTo && (next.mode ?? mode) === "range") params.set("toWeek", nextTo);
    startTransition(() => router.replace(`/attendance?${params.toString()}`, { scroll: false }));
  }

  const previewHref = selectedClassId
    ? `/api/attendance/register-teacher?class=${encodeURIComponent(selectedClassId)}&date=${encodeURIComponent(date)}&mode=${mode}${selectedTermId ? `&term=${encodeURIComponent(selectedTermId)}` : ""}${selectedFromWeek && mode !== "term" ? `&fromWeek=${encodeURIComponent(selectedFromWeek)}` : ""}${selectedToWeek && mode === "range" ? `&toWeek=${encodeURIComponent(selectedToWeek)}` : ""}`
    : undefined;
  const title = mode === "term" ? "Full Term Register" : mode === "range" ? "Week Range Register" : "Specific Week Register";
  const formatDate = (value: string) => new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  const periodLabel = mode === "term"
    ? selectedTerm?.displayName ?? "Select a term"
    : mode === "range" && selectedFromWeek && selectedToWeek
      ? `${formatDate(selectedFromWeek)} – ${formatDate(addDays(selectedToWeek, 4))}`
      : selectedFromWeek
        ? `Week ending ${formatDate(addDays(selectedFromWeek, 4))}`
        : "Select a week";

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,1fr)_minmax(10rem,.8fr)_minmax(10rem,1fr)_minmax(12rem,1.25fr)_auto] xl:items-end">
            <Picker
              label="Class"
              name="register-teacher-class"
              value={selectedClassId ?? ""}
              onChange={(classId) => navigate({ classId })}
              placeholder="Choose register class"
              options={classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))}
            />
            <Picker
              label="Period"
              name="register-teacher-mode"
              value={mode}
              onChange={(value) => navigate({ mode: value === "term" ? "term" : value === "range" ? "range" : "week" })}
              placeholder="Specific week"
              options={[
                { value: "week", label: "Specific week", helper: "One governed learner week" },
                { value: "range", label: "Week range", helper: "An inclusive From Week to To Week range" },
                { value: "term", label: "Full term", helper: "Opening week through the applicable as-at date" },
              ]}
            />
            <Picker
              label="Academic term"
              name="register-teacher-term"
              value={selectedTermId ?? ""}
              onChange={(value) => navigate({ termId: value || null, fromWeek: null, toWeek: null })}
              placeholder="Choose term"
              options={terms.map((term) => ({ value: term.id, label: term.displayName, helper: term.startsOn && term.endsOn ? `${term.startsOn} – ${term.endsOn}` : `Term ${term.termNumber} · Calendar dates required` }))}
            />
            {mode !== "term" ? (
              <div className={mode === "range" ? "grid gap-2 sm:col-span-2 sm:grid-cols-2 xl:col-span-1" : ""}>
                <Picker
                  label={mode === "range" ? "From Week" : "Week"}
                  name="register-teacher-from-week"
                  value={selectedFromWeek ?? ""}
                  onChange={(value) => {
                    const adjustedTo = mode === "range" && selectedToWeek && selectedToWeek < value ? value : selectedToWeek;
                    navigate({ fromWeek: value, toWeek: adjustedTo, date: addDays(adjustedTo ?? value, 4) });
                  }}
                  placeholder="Choose week"
                  options={weekOptions}
                  disabled={!selectedTerm?.startsOn || !selectedTerm.endsOn}
                />
                {mode === "range" ? (
                  <Picker
                    label="To Week"
                    name="register-teacher-to-week"
                    value={selectedToWeek ?? ""}
                    onChange={(value) => navigate({ toWeek: value, date: addDays(value, 4) })}
                    placeholder="Choose final week"
                    options={weekOptions.filter((item) => !selectedFromWeek || item.value >= selectedFromWeek)}
                    disabled={!selectedFromWeek}
                  />
                ) : null}
              </div>
            ) : null}
            <div className={`flex min-w-0 flex-col gap-1.5 sm:col-span-2 sm:flex-row sm:items-end sm:justify-end xl:col-span-1 ${mode === "term" ? "xl:col-start-4 xl:col-span-2" : ""}`}>
              {mode === "week" ? <div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">Navigate</p><WeekPicker className="mt-1.5" valueLabel={periodLabel} onPrevious={() => { const value = addDays(selectedFromWeek!, -7); navigate({ fromWeek: value, date: addDays(value, 4) }); }} onNext={() => { const value = addDays(selectedFromWeek!, 7); navigate({ fromWeek: value, date: addDays(value, 4) }); }} previousLabel="Previous register week" nextLabel="Next register week" pending={pending} previousDisabled={selectedWeekIndex <= 0} nextDisabled={selectedWeekIndex < 0 || selectedWeekIndex >= weekOptions.length - 1} /></div> : <div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">Selected period</p><div className="mt-1.5 flex min-h-10 items-center rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs font-semibold shadow-[var(--shadow-xs)]"><CalendarRange className="mr-2 size-4 shrink-0 text-brand" aria-hidden="true" /><span className="truncate">{periodLabel}</span>{pending ? <Spinner className="ml-2 size-4 shrink-0 text-brand" /> : null}</div></div>}
            <OfficialDocumentActions
              previewHref={previewHref}
              previewTitle={`${selectedClass?.name ?? "Register"} · ${title}`}
              previewDescription="Physical-register style preview generated from live ScolaPro attendance."
              previewLabel="Preview / Print"
              compact
              disabled={!selectedClassId || pending}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><FileText className="size-4" aria-hidden="true" /></span>
            <div>
              <h2 className="scolapro-section-title">Register Teacher document</h2>
              <p className="scolapro-section-description">A digital balancing copy of the physical register. Valid school days show every active learner as present by default; only absences change the mark.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 bg-surface px-4 py-4 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
          <div className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Readiness</span><strong className="text-foreground">{weeklySubmittedDays}/{weeklyExpectedDays} days</strong></div>
          <span className="hidden h-4 w-px bg-border-subtle sm:block" aria-hidden="true" />
          <div className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Marks</span><strong className="font-sans text-base font-medium italic text-foreground">I</strong><span>present</span><strong className="font-sans text-base font-medium italic text-[color:var(--danger)]">a</strong><span>absent</span></div>
          <span className="hidden h-4 w-px bg-border-subtle sm:block" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-2"><CalendarRange className="size-4 shrink-0 text-brand" aria-hidden="true" /><UsersRound className="size-4 shrink-0 text-brand" aria-hidden="true" /><span className="text-muted-foreground">Attendance + absence = possible; governed days and enrolment dates are applied automatically.</span></div>
        </div>
      </section>
    </div>
  );
}
