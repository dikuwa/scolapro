"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  FileScan,
  School,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { formFieldControlOffsetClass, formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import { TimeField } from "@/components/ui/time-field";
import {
  saveOperationalCalendarEvent,
  saveTermCalendarProfile,
  type TeachingImpactActionState,
} from "@/features/calendar/server/actions";
import type {
  CalendarStaffOption,
  DepartmentCalendarOption,
  OperationalCalendarEvent,
  TermCalendarSummary,
} from "@/features/calendar/server/operational-calendar";
import type { BellScheduleSummary } from "@/features/timetable/server/bell-calendar";

const initialState: TeachingImpactActionState = {};
const inputClass =
  "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

const eventKinds = [
  ["event", "Event"],
  ["deadline", "Deadline"],
  ["meeting", "Meeting"],
  ["class_visit", "Class visit"],
  ["assessment", "Assessment"],
  ["submission", "Submission"],
  ["examination", "Examination"],
  ["school_activity", "School activity"],
  ["teaching_cutoff", "Teaching cutoff"],
  ["ceremony", "Ceremony"],
  ["sport", "Sport"],
  ["other", "Other"],
].map(([value, label]) => ({ value, label }));

const schoolAudienceOptions = [
  { value: "all_school", label: "Whole school", helper: "All school staff; publish outward separately where needed" },
  { value: "all_staff", label: "All staff", helper: "Staff-facing operational event" },
  { value: "teachers", label: "Teachers", helper: "Teaching staff" },
  { value: "learners", label: "Learners", helper: "Learner-facing event" },
  { value: "parents", label: "Parents / guardians", helper: "Parent-facing event" },
  { value: "specific_teacher", label: "Specific teacher", helper: "One staff member" },
];

const departmentAudienceOptions = [
  { value: "department_staff", label: "Department staff", helper: "All teachers governed by this HOD portfolio" },
  { value: "specific_teacher", label: "Specific teacher", helper: "For example, a class visit" },
];

const learnerDayEffects = [
  { value: "UNCHANGED", label: "No school-day change", helper: "Default for meetings, activities and deadlines" },
  { value: "NO_TEACHING", label: "Learners not at school", helper: "Closes learner registers and pauses normal teaching" },
  { value: "SCHOOL_DAY", label: "Special school day", helper: "Explicitly opens a normally closed date, including an approved weekend" },
  { value: "PARTIAL_DAY", label: "Partial learner day", helper: "School operates for part of the day" },
  { value: "ALTERED_TIMETABLE", label: "Altered timetable", helper: "A different bell/timetable applies" },
  { value: "EXAM_TIMETABLE", label: "Exam timetable", helper: "Learners follow the examination timetable" },
];

function formatDate(value: string | null) {
  if (!value) return "Not configured";
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function eventDateLabel(event: OperationalCalendarEvent) {
  const range =
    event.startsOn === event.endsOn
      ? formatDate(event.startsOn)
      : `${formatDate(event.startsOn)} – ${formatDate(event.endsOn)}`;
  return event.startsAt && event.endsAt
    ? `${range} · ${event.startsAt.slice(0, 5)}–${event.endsAt.slice(0, 5)}`
    : range;
}

function TermCalendarProfileEditor({
  term,
  canManage,
  open,
  onToggle,
  onClose,
}: {
  term: TermCalendarSummary;
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveTermCalendarProfile, initialState);
  const [learnerStartsOn, setLearnerStartsOn] = useState(term.learnerStartsOn ?? "");
  const [learnerEndsOn, setLearnerEndsOn] = useState(term.learnerEndsOn ?? "");
  const [teacherStartsOn, setTeacherStartsOn] = useState(term.teacherStartsOn ?? "");
  const [teacherEndsOn, setTeacherEndsOn] = useState(term.teacherEndsOn ?? "");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      queueMicrotask(onClose);
    } else toast.error(state.message);
  }, [onClose, state]);

  const hasOfficial = term.officialLearnerDayCount != null;
  const matches = hasOfficial && term.officialLearnerDayCount === term.calculatedLearnerDayCount;

  return (
    <article
      className={[
        "rounded-[var(--radius-sm)] border bg-surface p-3.5 transition",
        open
          ? "border-[color:var(--brand)]/45 ring-2 ring-[color:var(--brand-soft)] shadow-[var(--shadow-sm)]"
          : "border-border-subtle",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{term.termName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Learners {formatDate(term.learnerStartsOn)} – {formatDate(term.learnerEndsOn)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Teachers {formatDate(term.teacherStartsOn)} – {formatDate(term.teacherEndsOn)}
          </p>
        </div>
        <span
          className={[
            "rounded-[var(--radius-xs)] px-2 py-1 text-[0.68rem] font-semibold",
            !hasOfficial
              ? "bg-surface-muted text-muted-foreground"
              : matches
                ? "bg-success-soft text-[color:var(--success)]"
                : "bg-warning-soft text-[color:var(--warning)]",
          ].join(" ")}
        >
          {term.calculatedLearnerDayCount}
          {hasOfficial ? ` / ${term.officialLearnerDayCount}` : ""} days
        </span>
      </div>

      {hasOfficial && !matches ? (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-xs text-[color:var(--warning)]">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Resolved school days differ from the published total by{" "}
            {Math.abs(term.calculatedLearnerDayCount - (term.officialLearnerDayCount ?? 0))}. Attendance uses the resolved
            calendar; review the source or exceptions rather than forcing the printed total.
          </span>
        </div>
      ) : null}

      {term.sourceLabel ? (
        <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
          Source: {term.sourceLabel}
          {term.sourceReference ? ` · ${term.sourceReference}` : ""}
        </p>
      ) : null}

      {canManage ? (
        <>
          <div className="mt-3">
            <Button type="button" size="sm" variant={open ? "neutral" : "soft"} onClick={onToggle} aria-expanded={open}>
              {open ? "Close " + term.termName : "Edit " + term.termName}
            </Button>
          </div>
          {open ? (
            <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="academicTermId" value={term.academicTermId} />
              <DateField
                label="Learner opening"
                name="learnerStartsOn"
                value={learnerStartsOn}
                onChange={setLearnerStartsOn}
                required
              />
              <DateField
                label="Learner closing"
                name="learnerEndsOn"
                value={learnerEndsOn}
                onChange={setLearnerEndsOn}
                min={learnerStartsOn || undefined}
                required
              />
              <DateField
                label="Teacher opening"
                name="teacherStartsOn"
                value={teacherStartsOn}
                onChange={setTeacherStartsOn}
              />
              <DateField
                label="Teacher closing"
                name="teacherEndsOn"
                value={teacherEndsOn}
                onChange={setTeacherEndsOn}
              />
              <div>
                <label htmlFor={`official-days-${term.academicTermId}`} className={formFieldLabelClass}>
                  Published learner days
                </label>
                <input
                  id={`official-days-${term.academicTermId}`}
                  name="officialLearnerDayCount"
                  inputMode="numeric"
                  defaultValue={term.officialLearnerDayCount ?? ""}
                  className={`${inputClass} ${formFieldControlOffsetClass}`}
                  placeholder="Validation target"
                />
              </div>
              <div>
                <label htmlFor={`source-label-${term.academicTermId}`} className={formFieldLabelClass}>
                  Source label
                </label>
                <input
                  id={`source-label-${term.academicTermId}`}
                  name="sourceLabel"
                  defaultValue={term.sourceLabel ?? ""}
                  maxLength={240}
                  className={`${inputClass} ${formFieldControlOffsetClass}`}
                  placeholder="Official calendar / circular"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`source-ref-${term.academicTermId}`} className={formFieldLabelClass}>
                  Source reference (optional)
                </label>
                <input
                  id={`source-ref-${term.academicTermId}`}
                  name="sourceReference"
                  defaultValue={term.sourceReference ?? ""}
                  maxLength={500}
                  className={`${inputClass} ${formFieldControlOffsetClass}`}
                  placeholder="Document title, circular number or retained-source reference"
                />
              </div>
              <div className="sm:col-span-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-[0.7rem] leading-5 text-muted-foreground">
                <strong className="text-foreground">Learner dates are operational.</strong> Attendance, register availability, curriculum pacing and normal teaching capacity follow learner opening and closing. Teacher dates remain administrative metadata for staff duty/leave records.
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" loading={pending}>
                  Save term calendar
                </Button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export function OperationalCalendarManager({
  schoolId,
  year,
  terms,
  events,
  departments,
  staffOptions,
  schedules,
  canManageSchool,
  canManageDepartment,
}: {
  schoolId: string;
  year: number;
  terms: TermCalendarSummary[];
  events: OperationalCalendarEvent[];
  departments: DepartmentCalendarOption[];
  staffOptions: CalendarStaffOption[];
  schedules: BellScheduleSummary[];
  canManageSchool: boolean;
  canManageDepartment: boolean;
}) {
  const [state, action, pending] = useActionState(saveOperationalCalendarEvent, initialState);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTermId, setActiveTermId] = useState<string | null>(null);
  const closeTermEditor = useCallback(() => setActiveTermId(null), []);
  const availableScopes = useMemo(
    () => [
      ...(canManageSchool ? [{ value: "school", label: "School event", helper: "Whole-school operational calendar" }] : []),
      ...(canManageDepartment && departments.length
        ? [{ value: "department", label: "Department event", helper: "HOD-governed portfolio" }]
        : []),
    ],
    [canManageDepartment, canManageSchool, departments.length],
  );
  const [scopeKind, setScopeKind] = useState<"school" | "department">(
    canManageSchool ? "school" : "department",
  );
  const [eventKind, setEventKind] = useState("event");
  const [startsOn, setStartsOn] = useState(`${year}-01-01`);
  const [endsOn, setEndsOn] = useState(`${year}-01-01`);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [audienceScope, setAudienceScope] = useState(scopeKind === "department" ? "department_staff" : "all_school");
  const [departmentAssignmentId, setDepartmentAssignmentId] = useState(departments[0]?.assignmentId ?? "");
  const [targetStaffMemberId, setTargetStaffMemberId] = useState("");
  const [learnerDayEffect, setLearnerDayEffect] = useState("UNCHANGED");
  const [bellScheduleId, setBellScheduleId] = useState("");

  const officialTotal = terms.reduce((sum, term) => sum + (term.officialLearnerDayCount ?? 0), 0);
  const resolvedTotal = terms.reduce((sum, term) => sum + term.calculatedLearnerDayCount, 0);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      queueMicrotask(() => setShowAdd(false));
    } else toast.error(state.message);
  }, [state]);

  function changeScopeKind(value: string) {
    const next = value as "school" | "department";
    setScopeKind(next);
    if (next === "department") {
      setAudienceScope("department_staff");
      setLearnerDayEffect("UNCHANGED");
      setBellScheduleId("");
    } else if (audienceScope === "department_staff") {
      setAudienceScope("all_school");
    }
  }

  const audienceOptions = scopeKind === "department" ? departmentAudienceOptions : schoolAudienceOptions;
  const canChooseSchedule = learnerDayEffect === "ALTERED_TIMETABLE" || learnerDayEffect === "EXAM_TIMETABLE";

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="scolapro-section-title">Official school calendar</h2>
            <p className="scolapro-section-description">
              Learner opening and closing dates are the operational boundaries for registers, curriculum pacing and timetable capacity.
              Teacher dates are administrative. Published school-day totals remain validation targets; resolved learner days drive attendance.
            </p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-right">
            <p className="text-[0.65rem] font-medium text-muted-foreground">Resolved / published learner days</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {resolvedTotal}
              {officialTotal ? ` / ${officialTotal}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {terms.map((term) => (
            <TermCalendarProfileEditor
              key={term.academicTermId}
              term={term}
              canManage={canManageSchool}
              open={activeTermId === term.academicTermId}
              onToggle={() => setActiveTermId((current) => current === term.academicTermId ? null : term.academicTermId)}
              onClose={closeTermEditor}
            />
          ))}
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <CalendarDays className="size-4" />
            </span>
            <div>
              <h2 className="scolapro-section-title">School & department events</h2>
              <p className="scolapro-section-description !mt-0">
                Meetings, examinations, ceremonies, deadlines, CASS/target-mark submissions and class visits. Events are
                informational unless leadership explicitly changes learner-day status.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
            <Link
              href="/school/imports/operations?adapter=calendar"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold text-foreground hover:bg-surface-elevated"
            >
              <FileScan className="size-3.5" />
              Import / OCR
            </Link>
            {availableScopes.length ? (
              <Button type="button" size="sm" variant="soft" onClick={() => setShowAdd((value) => !value)}>
                {showAdd ? "Close" : "Add event"}
              </Button>
            ) : null}
          </div>
        </div>

        {events.length ? (
          <div className="mt-3 divide-y divide-border-subtle">
            {events.map((event) => (
              <article
                key={event.id}
                className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.8fr)_auto] sm:items-start"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {event.scopeKind === "department" ? (
                      <UsersRound className="size-3.5 shrink-0 text-[color:var(--accent-amber)]" />
                    ) : (
                      <School className="size-3.5 shrink-0 text-[color:var(--accent-mint)]" />
                    )}
                    <h3 className="scolapro-record-title truncate">{event.title}</h3>
                  </div>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {event.scopeKind === "department" ? event.departmentLabel ?? "Department" : "School"} ·{" "}
                    {event.eventKind.replaceAll("_", " ")}
                  </p>
                  {event.description ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{event.description}</p>
                  ) : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{eventDateLabel(event)}</p>
                <span
                  className={[
                    "w-fit rounded-[var(--radius-xs)] px-2 py-1 text-[0.68rem] font-semibold",
                    event.learnerDayEffect === "UNCHANGED"
                      ? "bg-surface-muted text-muted-foreground"
                      : event.learnerDayEffect === "NO_TEACHING"
                        ? "bg-warning-soft text-[color:var(--warning)]"
                        : "bg-brand-soft text-brand-strong",
                  ].join(" ")}
                >
                  {event.learnerDayEffect === "UNCHANGED"
                    ? "Info only"
                    : event.learnerDayEffect.replaceAll("_", " ")}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-5 text-sm text-muted-foreground">
            No school or department operational events are configured for {year}.
          </div>
        )}

        {showAdd ? (
          <form action={action} className="mt-5 grid gap-4 border-t border-border-subtle pt-5 lg:grid-cols-2">
            <input type="hidden" name="schoolId" value={schoolId} />
            <input type="hidden" name="academicYear" value={year} />
            {availableScopes.length > 1 ? (
              <Picker
                label="Calendar scope"
                name="scopeKind"
                value={scopeKind}
                onChange={changeScopeKind}
                options={availableScopes}
                placeholder="Choose scope"
              />
            ) : (
              <input type="hidden" name="scopeKind" value={scopeKind} />
            )}
            <Picker
              label="Event type"
              name="eventKind"
              value={eventKind}
              onChange={setEventKind}
              options={eventKinds}
              placeholder="Choose event type"
            />
            <div className="lg:col-span-2">
              <label htmlFor="operational-event-title" className={formFieldLabelClass}>
                Title
              </label>
              <input
                id="operational-event-title"
                name="title"
                required
                maxLength={180}
                className={`${inputClass} ${formFieldControlOffsetClass}`}
                placeholder={
                  scopeKind === "department" ? "For example, CASS marks submission due" : "For example, Parent meeting: Grade 8 & 9"
                }
              />
            </div>
            <DateField
              label="Starts on"
              name="startsOn"
              value={startsOn}
              onChange={(value) => {
                setStartsOn(value);
                if (endsOn < value) setEndsOn(value);
              }}
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              required
            />
            <DateField
              label="Ends on"
              name="endsOn"
              value={endsOn}
              onChange={setEndsOn}
              min={startsOn || `${year}-01-01`}
              max={`${year}-12-31`}
              required
            />
            <TimeField label="Starts at (optional)" name="startsAt" value={startsAt} onChange={setStartsAt} />
            <TimeField label="Ends at (optional)" name="endsAt" value={endsAt} onChange={setEndsAt} />

            {scopeKind === "department" ? (
              <Picker
                label="Department / HOD portfolio"
                name="departmentAssignmentId"
                value={departmentAssignmentId}
                onChange={setDepartmentAssignmentId}
                options={departments.map((department) => ({
                  value: department.assignmentId,
                  label: department.label,
                  helper: department.subjectNames.join(", "),
                }))}
                placeholder="Choose department"
              />
            ) : (
              <input type="hidden" name="departmentAssignmentId" value="" />
            )}

            <Picker
              label="Audience"
              name="audienceScope"
              value={audienceScope}
              onChange={(value) => {
                setAudienceScope(value);
                if (value !== "specific_teacher") setTargetStaffMemberId("");
              }}
              options={audienceOptions}
              placeholder="Choose audience"
            />

            {audienceScope === "specific_teacher" ? (
              <Picker
                label="Target teacher"
                name="targetStaffMemberId"
                value={targetStaffMemberId}
                onChange={setTargetStaffMemberId}
                options={staffOptions.map((staff) => ({ value: staff.staffMemberId, label: staff.label }))}
                placeholder="Search teacher"
                searchable
              />
            ) : (
              <input type="hidden" name="targetStaffMemberId" value="" />
            )}

            {scopeKind === "school" ? (
              <Picker
                label="Learner school-day effect"
                name="learnerDayEffect"
                value={learnerDayEffect}
                onChange={(value) => {
                  setLearnerDayEffect(value);
                  if (value !== "ALTERED_TIMETABLE" && value !== "EXAM_TIMETABLE") setBellScheduleId("");
                }}
                options={learnerDayEffects}
                placeholder="Choose effect"
              />
            ) : (
              <input type="hidden" name="learnerDayEffect" value="UNCHANGED" />
            )}

            {scopeKind === "school" && canChooseSchedule ? (
              <Picker
                label="Alternate bell schedule"
                name="bellScheduleId"
                value={bellScheduleId}
                onChange={setBellScheduleId}
                options={schedules.map((schedule) => ({
                  value: schedule.id,
                  label: schedule.name,
                  helper: `From ${schedule.effectiveFrom}`,
                }))}
                placeholder="Use effective schedule"
              />
            ) : (
              <input type="hidden" name="bellScheduleId" value="" />
            )}

            <div className="lg:col-span-2">
              <label htmlFor="operational-event-description" className={formFieldLabelClass}>
                Notes / instructions (optional)
              </label>
              <textarea
                id="operational-event-description"
                name="description"
                rows={3}
                maxLength={3000}
                className={`${inputClass} ${formFieldControlOffsetClass} resize-y py-2.5`}
                placeholder="Add concise operational detail. Do not duplicate information already represented by the scope and event type."
              />
            </div>

            <input type="hidden" name="linkedModule" value="" />
            <input type="hidden" name="linkedPath" value="" />
            <div className="lg:col-span-2">
              <Button type="submit" loading={pending}>
                Add {scopeKind === "department" ? "department" : "school"} event
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-success-soft text-[color:var(--success)]">
            <CheckCircle2 className="size-4" />
          </span>
          <div>
            <h2 className="scolapro-section-title">Calendar rule</h2>
            <p className="scolapro-section-description !mt-0">
              An event does not close registers simply because it exists. Only an explicit learner-day effect changes the
              resolved school day. Department events can never change learner school-day status.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
