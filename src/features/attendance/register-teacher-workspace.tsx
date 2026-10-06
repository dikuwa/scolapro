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
}: {
  classes: AttendanceClassOption[];
  selectedClassId: string | null;
  date: string;
  mode: "week" | "term";
  weeklySubmittedDays: number;
  weeklyExpectedDays: number;
  terms: RegisterTeacherTermOption[];
  selectedTermId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;

  function navigate(next: { classId?: string; mode?: "week" | "term"; termId?: string | null; date?: string }) {
    const params = new URLSearchParams();
    params.set("view", "register");
    params.set("date", next.date ?? date);
    params.set("mode", next.mode ?? mode);
    if (next.classId ?? selectedClassId) params.set("class", next.classId ?? selectedClassId ?? "");
    const termId = next.termId === undefined ? selectedTermId : next.termId;
    if (termId) params.set("term", termId);
    startTransition(() => router.replace(`/attendance?${params.toString()}`, { scroll: false }));
  }

  const previewHref = selectedClassId
    ? `/api/attendance/register-teacher?class=${encodeURIComponent(selectedClassId)}&date=${encodeURIComponent(date)}&mode=${mode}${selectedTermId ? `&term=${encodeURIComponent(selectedTermId)}` : ""}`
    : undefined;
  const title = mode === "term" ? "Term Register" : "Weekly Register";
  const weekEnding = (() => {
    const value = new Date(`${date}T12:00:00`);
    const day = value.getDay();
    const offsetToFriday = day === 0 ? -2 : 5 - day;
    value.setDate(value.getDate() + offsetToFriday);
    return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "short", year: "numeric" }).format(value);
  })();

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
              onChange={(value) => navigate({ mode: value === "term" ? "term" : "week" })}
              placeholder="Weekly register"
              options={[
                { value: "week", label: "Weekly register", helper: "Friday submission / balancing copy" },
                { value: "term", label: "Term register", helper: "Full selected-term balancing ledger" },
              ]}
            />
            {mode === "term" ? (
              <Picker
                label="Academic term"
                name="register-teacher-term"
                value={selectedTermId ?? ""}
                onChange={(value) => navigate({ termId: value || null })}
                placeholder="Choose term"
                options={terms.map((term) => ({ value: term.id, label: term.displayName, helper: term.startsOn && term.endsOn ? `${term.startsOn} – ${term.endsOn}` : `Term ${term.termNumber}` }))}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending} onClick={() => { const current = new Date(`${date}T12:00:00`); current.setDate(current.getDate() - 7); navigate({ date: current.toISOString().slice(0, 10) }); }} aria-label="Previous register week" className="grid size-8 place-items-center rounded-[var(--radius-xs)] bg-surface-muted text-muted-foreground hover:text-foreground disabled:opacity-50"><ChevronLeft className="size-4" /></button>
            <div className="min-w-[9.5rem] rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2 text-center">
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">Week ending</p>
              <p className="mt-0.5 text-xs font-semibold text-foreground">{weekEnding}</p>
            </div>
            <button type="button" disabled={pending} onClick={() => { const current = new Date(`${date}T12:00:00`); current.setDate(current.getDate() + 7); navigate({ date: current.toISOString().slice(0, 10) }); }} aria-label="Next register week" className="grid size-8 place-items-center rounded-[var(--radius-xs)] bg-surface-muted text-muted-foreground hover:text-foreground disabled:opacity-50"><ChevronRight className="size-4" /></button>
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
