"use client";

import { CalendarRange, CheckCircle2, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardActionToggle } from "@/components/ui/card-action-toggle";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import type { AcademicCalendarTerm, AcademicCalendarYear } from "@/features/academics/server/academic-calendar";
import {
  configureAcademicTerm,
  configureAcademicYear,
  type AcademicCalendarState,
} from "@/features/academics/server/academic-calendar-actions";

const emptyState: AcademicCalendarState = {};

const termNameOptions = [
  { value: "1", label: "Term 1" },
  { value: "2", label: "Term 2" },
  { value: "3", label: "Term 3" },
  { value: "4", label: "Term 4" },
  { value: "5", label: "Term 5" },
  { value: "6", label: "Term 6" },
];

function formatDay(value: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

/** Closes the editor when its action succeeds, matching the shared setup pattern. */
function useCloseOnSuccess(state: AcademicCalendarState, close: () => void) {
  const router = useRouter();
  const success = state.success;
  const message = state.message;
  useEffect(() => {
    if (!success) return;
    if (message) toast.success(message);
    close();
    router.refresh();
  }, [success, message, close, router]);
}

export function AcademicCalendarSetup({
  schoolId,
  workspace,
  today,
}: {
  schoolId: string;
  workspace: { currentYear: number; years: AcademicCalendarYear[] };
  today: string;
}) {
  const [editingYear, setEditingYear] = useState(false);

  const knownYears = new Set(workspace.years.map((item) => item.year));
  const nextYear = workspace.currentYear + 1;
  const suggestion = knownYears.has(nextYear) ? nextYear + 1 : nextYear;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="scolapro-section-title">Academic calendar</h2>
          <p className="scolapro-section-description">
            Configure academic years and their terms. Year-end progression can only publish into a
            configured year, and official results use the term end date for grading applicability.
          </p>
        </div>
        <CardActionToggle
          open={editingYear}
          onClick={() => setEditingYear((current) => !current)}
          controls="academic-year-editor"
          action="add"
        />
      </div>

      {editingYear ? (
        <YearForm
          id="academic-year-editor"
          schoolId={schoolId}
          suggestedYear={suggestion}
          today={today}
          onClose={() => setEditingYear(false)}
        />
      ) : null}

      {workspace.years.length ? (
        <div className="divide-y divide-border-subtle">
          {workspace.years.map((year) => (
            <YearCard key={year.id} year={year} today={today} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center sm:px-5">
          <CalendarRange className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-foreground">No academic year configured</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
            Add the current academic year before configuring grades, register classes or terms.
          </p>
        </div>
      )}
    </section>
  );
}

function YearForm({
  id,
  schoolId,
  suggestedYear,
  today,
  onClose,
}: {
  id: string;
  schoolId: string;
  suggestedYear: number;
  today: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(configureAcademicYear, emptyState);
  useCloseOnSuccess(state, onClose);
  const [year, setYear] = useState(String(suggestedYear));
  const [startsOn, setStartsOn] = useState(`${suggestedYear}-01-13`);
  const [endsOn, setEndsOn] = useState(`${suggestedYear}-12-05`);

  const yearValid = /^\d{4}$/.test(year.trim());
  const canSubmit = yearValid && Boolean(startsOn) && Boolean(endsOn) && !pending;

  return (
    <form action={action} id={id} className="grid gap-3 border-b border-border-subtle bg-surface-muted/40 px-4 py-4 sm:grid-cols-2 sm:px-5">
      <input type="hidden" name="schoolId" value={schoolId} />
      <label className="block space-y-1">
        <span className="block text-xs font-medium">Academic year</span>
        <input
          name="year"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={(event) => setYear(event.target.value.replace(/[^0-9]/g, ""))}
          className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm"
          placeholder="e.g. 2027"
        />
        <span className="block text-[0.68rem] text-muted-foreground">
          The next year must exist before year-end progression can publish into it.
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="Starts on" name="startsOn" value={startsOn} onChange={setStartsOn} required />
        <DateField label="Ends on" name="endsOn" value={endsOn} onChange={setEndsOn} required />
      </div>
      {state.message && !state.success ? (
        <p role="alert" className="text-xs font-medium text-[color:var(--danger)] sm:col-span-2">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" loading={pending} disabled={!canSubmit}>
          <Plus className="size-4" aria-hidden="true" />
          Save academic year
        </Button>
        <Button type="button" variant="neutral" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
      <p className="text-[0.68rem] text-muted-foreground sm:col-span-2">
        Today is {formatDay(today)}. Existing dates can be corrected until the year is closed.
      </p>
    </form>
  );
}

function YearCard({ year, today }: { year: AcademicCalendarYear; today: string }) {
  const [editingTerm, setEditingTerm] = useState(false);
  const closed = year.status === "closed";

  return (
    <article className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="scolapro-record-title">{year.year}</p>
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
            {formatDay(year.startsOn)} – {formatDay(year.endsOn)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium capitalize ${
              closed
                ? "bg-surface-muted text-muted-foreground"
                : year.status === "active"
                  ? "bg-success-soft text-[color:var(--success)]"
                  : "bg-warning-soft text-[color:var(--warning)]"
            }`}
          >
            {year.status}
          </span>
          {!closed ? (
            <Button type="button" variant="soft" size="sm" onClick={() => setEditingTerm((current) => !current)}>
              {editingTerm ? "Close term editor" : "Add or edit term"}
            </Button>
          ) : null}
        </div>
      </div>

      {editingTerm && !closed ? (
        <TermForm
          yearId={year.id}
          year={year.year}
          existingTerms={year.terms}
          today={today}
          onClose={() => setEditingTerm(false)}
        />
      ) : null}

      {year.terms.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {year.terms.map((term) => (
            <TermRow key={term.id} term={term} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No terms configured. Official result approval requires a term end date.
        </p>
      )}
    </article>
  );
}

function TermRow({ term }: { term: AcademicCalendarTerm }) {
  return (
    <li className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{term.displayName}</p>
        {term.endsOn ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-[color:var(--success)]" aria-hidden="true" />
        ) : null}
      </div>
      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
        {formatDay(term.startsOn)} – {formatDay(term.endsOn)}
      </p>
      <p className="mt-0.5 text-[0.64rem] capitalize text-muted-foreground">{term.status}</p>
    </li>
  );
}

function TermForm({
  yearId,
  year,
  existingTerms,
  today,
  onClose,
}: {
  yearId: string;
  year: number;
  existingTerms: AcademicCalendarTerm[];
  today: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(configureAcademicTerm, emptyState);
  useCloseOnSuccess(state, onClose);

  const firstEditable = existingTerms[0];
  const initialTerm = String(firstEditable?.termNumber ?? 1);
  const [termNumber, setTermNumber] = useState(initialTerm);
  const [displayName, setDisplayName] = useState(
    firstEditable?.displayName ?? "Term 1",
  );
  const [startsOn, setStartsOn] = useState(
    firstEditable?.startsOn ?? (firstEditable ? "" : `${year}-01-13`),
  );
  const [endsOn, setEndsOn] = useState(firstEditable?.endsOn ?? (firstEditable ? "" : `${year}-04-10`));

  const options = termNameOptions;

  const canSubmit = Boolean(termNumber) && Boolean(displayName.trim()) && Boolean(startsOn) && Boolean(endsOn) && !pending;

  return (
    <form action={action} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2">
      <input type="hidden" name="academicYearId" value={yearId} />
      <Picker
        label="Term"
        name="termNumber"
        value={termNumber}
        onChange={(value) => {
          setTermNumber(value);
          const existing = existingTerms.find((term) => String(term.termNumber) === value);
          setDisplayName(existing?.displayName ?? termNameOptions.find((option) => option.value === value)?.label ?? displayName);
          setStartsOn(existing?.startsOn ?? `${year}-01-13`);
          setEndsOn(existing?.endsOn ?? `${year}-04-10`);
        }}
        options={options}
        placeholder="Choose term"
      />
      <label className="block space-y-1">
        <span className="block text-xs font-medium">Term name</span>
        <input
          name="displayName"
          value={displayName}
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
          className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm"
          placeholder="e.g. Term 1"
        />
      </label>
      <DateField label="Starts on" name="termStartsOn" value={startsOn} onChange={setStartsOn} required />
      <DateField label="Ends on" name="termEndsOn" value={endsOn} onChange={setEndsOn} required />
      <input type="hidden" name="startsOn" value={startsOn} />
      <input type="hidden" name="endsOn" value={endsOn} />
      {state.message && !state.success ? (
        <p role="alert" className="text-xs font-medium text-[color:var(--danger)] sm:col-span-2">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" loading={pending} disabled={!canSubmit}>
          Save term
        </Button>
        <Button type="button" variant="neutral" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
      <p className="text-[0.68rem] text-muted-foreground sm:col-span-2">
        Today is {formatDay(today)}. The term end date is what grading applicability uses.
      </p>
    </form>
  );
}
