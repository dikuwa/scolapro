"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, FileText, UsersRound } from "lucide-react";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-3 sm:grid-cols-2">
            <Picker
              label="Register class"
              name="register-teacher-class"
              value={selectedClassId ?? ""}
              onChange={(classId) => navigate({ classId })}
              placeholder="Choose register class"
              options={classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))}
            />
            <Picker
              label="Document period"
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
            ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
            {mode === "week" ? <button type="button" disabled={pending || !selectedFromWeek || weekOptions[0]?.value === selectedFromWeek} onClick={() => { const value = addDays(selectedFromWeek!, -7); navigate({ fromWeek: value, date: addDays(value, 4) }); }} aria-label="Previous register week" className="grid size-8 place-items-center rounded-[var(--radius-xs)] bg-surface-muted text-muted-foreground hover:text-foreground disabled:opacity-50"><ChevronLeft className="size-4" /></button> : null}
            <div className="min-w-[9.5rem] rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2 text-center">
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">Selected period</p>
              <p className="mt-0.5 text-xs font-semibold text-foreground">{periodLabel}</p>
            </div>
            {mode === "week" ? <button type="button" disabled={pending || !selectedFromWeek || weekOptions.at(-1)?.value === selectedFromWeek} onClick={() => { const value = addDays(selectedFromWeek!, 7); navigate({ fromWeek: value, date: addDays(value, 4) }); }} aria-label="Next register week" className="grid size-8 place-items-center rounded-[var(--radius-xs)] bg-surface-muted text-muted-foreground hover:text-foreground disabled:opacity-50"><ChevronRight className="size-4" /></button> : null}
            {pending ? <Spinner className="size-4 text-brand" /> : null}
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

      <section className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-border-subtle sm:grid-cols-3">
        <div className="bg-surface p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">Friday submission readiness</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-foreground">{weeklySubmittedDays}/{weeklyExpectedDays}</p>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">Teaching-day registers confirmed for the selected week.</p>
        </div>
        <div className="bg-surface p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">Selected document</p>
          <p className="mt-1.5 text-sm font-semibold text-brand-strong">{selectedClass?.name ?? "No register class"} · {title}</p>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">Boys and Girls print as separate physical-register sections.</p>
        </div>
        <div className="bg-surface p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">Balance rule</p>
          <p className="mt-1.5 text-sm font-semibold text-foreground">Attendance + absence = possible</p>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">Possible attendance follows governed school days and enrolment dates.</p>
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
        <div className="grid gap-px bg-border-subtle sm:grid-cols-3">
          <div className="bg-surface p-4 sm:p-5">
            <p className="text-xs font-medium text-muted-foreground">Present mark</p>
            <p className="mt-2 font-sans text-3xl font-medium italic text-foreground">I</p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">Sans-serif italic — no serifs.</p>
          </div>
          <div className="bg-surface p-4 sm:p-5">
            <p className="text-xs font-medium text-muted-foreground">Absent mark</p>
            <p className="mt-2 font-sans text-3xl font-medium italic text-[color:var(--danger)]">a</p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">An absence changes only that learner/day cell.</p>
          </div>
          <div className="bg-surface p-4 sm:p-5">
            <p className="text-xs font-medium text-muted-foreground">Automatic balancing</p>
            <div className="mt-2 flex items-center gap-2"><CalendarRange className="size-5 text-brand" aria-hidden="true" /><UsersRound className="size-5 text-brand" aria-hidden="true" /></div>
            <p className="mt-2 text-[0.7rem] leading-5 text-muted-foreground">Non-teaching days and learner enrolment boundaries are excluded automatically from possible attendance.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
