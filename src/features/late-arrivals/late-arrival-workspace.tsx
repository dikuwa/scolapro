"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, Clock3, History, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Spinner } from "@/components/ui/spinner";
import {
  recordLateArrival,
  reassignDetentionSupervisor,
  resolveDetention,
  setDetentionSupervisionEligibility,
  undoLatestLateArrival,
  type LateArrivalActionState,
} from "@/features/late-arrivals/server/actions";
import type { DetentionStaffOption, LateArrivalLearner, LateDetentionItem } from "@/features/late-arrivals/server/queries";

const initialState: LateArrivalActionState = {};
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function weekDates(today: string) {
  const current = new Date(`${today}T12:00:00`);
  const day = current.getDay() || 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - day + 1);
  return weekdayLabels.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { label, date: date.toISOString().slice(0, 10) };
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function isStaffAvailableOn(staff: DetentionStaffOption, date: string) {
  return staff.availabilityWindows.some(
    (window) => window.effectiveFrom <= date && (window.effectiveTo === null || window.effectiveTo >= date),
  );
}

export function LateArrivalWorkspace({
  learners,
  detention,
  staffOptions,
  schoolId,
  canManage,
  today,
}: {
  learners: LateArrivalLearner[];
  detention: LateDetentionItem[];
  staffOptions: DetentionStaffOption[];
  schoolId: string;
  canManage: boolean;
  today: string;
}) {
  const [state, action, pending] = useActionState(recordLateArrival, initialState);
  const [undoState, undoAction, undoPending] = useActionState(undoLatestLateArrival, initialState);
  const [enrolmentId, setEnrolmentId] = useState("");
  const [arrivalDate, setArrivalDate] = useState(today);
  const [classFilter, setClassFilter] = useState("");
  const [staffRotationOpen, setStaffRotationOpen] = useState(false);
  const [supervisors, setSupervisors] = useState<Record<string, string>>(
    () => Object.fromEntries(detention.map((item) => [item.id, item.assignedStaffMemberId ?? ""])),
  );

  const selectedLearner = learners.find((item) => item.enrolmentId === enrolmentId) ?? null;
  const days = useMemo(() => weekDates(today), [today]);
  const classOptions = useMemo(
    () => [...new Set(learners.map((learner) => learner.registerClass).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [learners],
  );
  const filteredLearners = classFilter ? learners.filter((learner) => learner.registerClass === classFilter) : learners;
  const selectableSupervisors = useMemo(
    () => [...staffOptions].sort((left, right) => Number(right.eligible) - Number(left.eligible) || left.name.localeCompare(right.name)),
    [staffOptions],
  );
  const currentStaffOptions = useMemo(
    () => selectableSupervisors.filter((staff) => isStaffAvailableOn(staff, today)),
    [selectableSupervisors, today],
  );
  const preferredStaffCount = currentStaffOptions.filter((staff) => staff.eligible).length;
  const generalStaffCount = currentStaffOptions.length - preferredStaffCount;

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  useEffect(() => {
    if (!undoState.message) return;
    if (undoState.success) toast.success(undoState.message);
    else toast.error(undoState.message);
  }, [undoState]);

  const changeClassFilter = (value: string) => {
    setClassFilter(value);
    if (value && selectedLearner?.registerClass !== value) setEnrolmentId("");
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div>
            <h2 className="scolapro-section-title">Record morning late arrival</h2>
            <p className="scolapro-section-description">Detention is triggered by every 3 cumulative late arrivals across the academic year. The weekly strip is only a quick visibility aid.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)]">
              <Picker
                label="Class"
                ariaLabel="Filter late-arrival learners by class"
                value={classFilter}
                onChange={changeClassFilter}
                placeholder="All classes"
                searchable
                searchPlaceholder="Search classes"
                options={[{ value: "", label: "All classes" }, ...classOptions.map((registerClass) => ({ value: registerClass, label: registerClass }))]}
              />
              <SearchableSelect
                label="Learner"
                name="late-arrival-learner-ui"
                value={enrolmentId}
                onChange={setEnrolmentId}
                placeholder={classFilter ? `Choose learner in ${classFilter}` : "Choose learner"}
                searchPlaceholder="Search by learner name or admission number…"
                emptyMessage={(query) => `No learner found for '${query}' — check the spelling or change the class filter.`}
                options={filteredLearners.map((learner) => ({
                  value: learner.enrolmentId,
                  label: learner.name,
                  helper: `${learner.registerClass} · ${learner.admissionNumber ?? "No admission number"} · ${learner.triggerProgress} of ${learner.triggerThreshold}`,
                  group: learner.registerClass,
                  searchText: learner.admissionNumber ?? "",
                }))}
              />
            </div>
            <p className="mt-1.5 text-[0.65rem] text-muted-foreground">Filter by class first when the learner list is long. Grade filtering will be added when grade metadata is exposed by the roster read model rather than guessed from class names.</p>

            {selectedLearner ? (
              <div className="mt-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="scolapro-record-title">{selectedLearner.name}</p>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{selectedLearner.registerClass} · {selectedLearner.totalLateCount} late arrival{selectedLearner.totalLateCount === 1 ? "" : "s"} recorded this year</p>
                  </div>
                  <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]">{selectedLearner.triggerProgress} of {selectedLearner.triggerThreshold}</span>
                </div>

                <div className="mt-3 grid grid-cols-5 gap-1.5" aria-label="Late arrivals this week">
                  {days.map((day) => {
                    const late = selectedLearner.weekLateDates.includes(day.date);
                    const future = day.date > today;
                    const selected = arrivalDate === day.date;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        disabled={future}
                        onClick={() => setArrivalDate(day.date)}
                        className={`min-h-12 rounded-[var(--radius-xs)] border px-1 text-center transition ${future ? "cursor-not-allowed border-border-subtle bg-surface-muted/45 text-muted-foreground/45" : late ? "border-[color:var(--warning)]/35 bg-warning-soft text-[color:var(--warning)]" : selected ? "border-[color:var(--brand)]/35 bg-brand-soft text-brand-strong" : "border-border-subtle bg-surface text-muted-foreground hover:border-border hover:text-foreground"}`}
                        aria-label={`${day.label} ${formatDate(day.date)}${late ? ", late recorded" : ""}`}
                      >
                        <span className="block text-[0.62rem] font-semibold">{day.label}</span>
                        <span className="mt-0.5 block text-[0.62rem]">{late ? "Late" : future ? "—" : "Clear"}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.65rem] text-muted-foreground">Select a filled day to edit that date, or select an available day before recording. Future dates remain blocked.</p>
                  {canManage && selectedLearner.lastLateDate ? (
                    <form action={undoAction}>
                      <input type="hidden" name="enrolmentId" value={selectedLearner.enrolmentId} />
                      <button type="submit" disabled={undoPending} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-danger-soft px-2.5 text-[0.68rem] font-semibold text-[color:var(--danger)] disabled:opacity-50">
                        {undoPending ? <Spinner className="size-3.5" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                        {undoPending ? "Undoing…" : `Undo last entry · ${formatDate(selectedLearner.lastLateDate)}`}
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <form action={action} className="rounded-[var(--radius-md)] bg-surface-muted/55 p-4">
            <input type="hidden" name="enrolmentId" value={enrolmentId} />
            <h3 className="scolapro-section-title">Arrival details</h3>
            <p className="scolapro-section-description">Choose the actual date the learner arrived late. Recording the same learner/date again updates that existing record instead of increasing the counter twice.</p>
            {selectedLearner ? <div className="mt-3 rounded-[var(--radius-sm)] bg-surface px-3 py-2.5 shadow-[var(--shadow-xs)]"><p className="text-xs font-semibold">{selectedLearner.name}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">Progress: {selectedLearner.triggerProgress} of {selectedLearner.triggerThreshold}{selectedLearner.lastLateDate ? ` · last late ${formatDate(selectedLearner.lastLateDate)}` : ""}</p></div> : <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Select a learner first.</div>}
            <DateField label="Late-arrival date" name="arrivalDate" value={arrivalDate} onChange={setArrivalDate} max={today} required className="mt-4" />
            <label className="mt-4 block text-xs font-medium">Note<textarea name="note" rows={3} placeholder="Optional context" className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 text-xs outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
            <button type="submit" disabled={!enrolmentId || !arrivalDate || pending} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? <Spinner className="size-4 text-white" /> : <Clock3 className="size-4" />}{pending ? "Recording…" : "Record late arrival"}</button>
          </form>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 className="scolapro-section-title">Detention queue</h2><p className="scolapro-section-description">Every three cumulative late arrivals creates a separate obligation. Uncompleted obligations roll to the next Friday and remain independent.</p></div>
            <div className="flex items-center gap-2"><Link href="/late-arrivals/history" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.7rem] font-medium text-muted-foreground hover:text-foreground"><History className="size-3.5" />History</Link><span className="rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]">{detention.length} open</span></div>
          </div>
        </div>
        {detention.length ? <div className="divide-y divide-border-subtle">{detention.map((item) => {
          const supervisorsForDueDate = selectableSupervisors.filter((staff) => isStaffAvailableOn(staff, item.dueOn));
          const assignedDateValid = !item.assignedStaffMemberId || supervisorsForDueDate.some((staff) => staff.id === item.assignedStaffMemberId);
          return (
            <div key={item.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.55fr)_auto] lg:items-end sm:px-5">
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="scolapro-record-title">{item.learnerName}</p>{item.rolloverCount > 0 ? <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-danger-soft px-2 py-0.5 text-[0.62rem] font-semibold text-[color:var(--danger)]"><RotateCcw className="size-3" />Overdue · rolled {item.rolloverCount}×</span> : null}</div>
                <p className="mt-1 text-[0.68rem] text-muted-foreground">Triggered {item.triggeredOn ? formatDate(item.triggeredOn) : "historically"} · due {formatDate(item.dueOn)}{item.originalDueOn !== item.dueOn ? ` · originally ${formatDate(item.originalDueOn)}` : ""}</p>
                <p className="mt-1 text-[0.68rem] text-muted-foreground">Supervisor: <span className="font-medium text-foreground">{item.assignedStaffName ?? "Not assigned"}</span></p>
                {!assignedDateValid ? <p className="mt-1 text-[0.65rem] font-medium text-[color:var(--warning)]">This supervisor is not placed at the school on the current due date. Reassign before detention.</p> : null}
              </div>

              {canManage ? (
                <form action={reassignDetentionSupervisor} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input type="hidden" name="obligationId" value={item.id} />
                  <input type="hidden" name="staffMemberId" value={supervisors[item.id] ?? ""} />
                  <SearchableSelect
                    ariaLabel={`Supervisor for ${item.learnerName}`}
                    value={supervisors[item.id] ?? ""}
                    onChange={(value) => setSupervisors((current) => ({ ...current, [item.id]: value }))}
                    placeholder={supervisorsForDueDate.length ? "Choose supervisor" : "No staff available on due date"}
                    searchPlaceholder="Search staff available that Friday…"
                    options={supervisorsForDueDate.map((staff) => ({
                      value: staff.id,
                      label: staff.name,
                      helper: `${staff.eligible ? "Preferred" : "General staff"} · ${staff.employeeNumber ?? "No employee number"}`,
                      searchText: staff.employeeNumber ?? "",
                    }))}
                  />
                  <button type="submit" disabled={!supervisors[item.id] || supervisors[item.id] === item.assignedStaffMemberId || !supervisorsForDueDate.some((staff) => staff.id === supervisors[item.id])} className="min-h-10 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45">Save</button>
                </form>
              ) : <div className="text-xs text-muted-foreground">Assigned supervision is managed by school leadership.</div>}

              <form action={resolveDetention}>
                <input type="hidden" name="obligationId" value={item.id} />
                <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-success-soft px-3 text-xs font-semibold text-[color:var(--success)] lg:w-auto"><ShieldCheck className="size-3.5" />Completed</button>
              </form>
            </div>
          );
        })}</div> : <div className="px-5 py-9 text-center text-xs text-muted-foreground">No open detention obligations.</div>}
      </section>

      {canManage ? (
        <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <button type="button" onClick={() => setStaffRotationOpen((open) => !open)} aria-expanded={staffRotationOpen} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-soft)] sm:px-5">
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Users className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="scolapro-section-title">Detention staff preference</h2>
              <p className="scolapro-section-description">Low-frequency setup · {preferredStaffCount} preferred · {generalStaffCount} general staff. General staff remain available when extra supervision is needed.</p>
            </div>
            <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${staffRotationOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {staffRotationOpen ? (
            <div className="border-t border-border-subtle px-4 pb-4 sm:px-5 sm:pb-5">
              <p className="mt-4 text-[0.68rem] text-muted-foreground">Mark regular detention supervisors as preferred so they appear first. This does not block other active school staff from being assigned when needed.</p>
              <div className="mt-3 divide-y divide-border-subtle rounded-[var(--radius-sm)] border border-border-subtle">
                {currentStaffOptions.map((staff) => (
                  <div key={staff.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0"><p className="truncate text-xs font-semibold">{staff.name}</p><p className="text-[0.65rem] text-muted-foreground">{staff.employeeNumber ?? "No employee number"}</p></div>
                    <form action={setDetentionSupervisionEligibility}>
                      <input type="hidden" name="schoolId" value={schoolId} />
                      <input type="hidden" name="staffMemberId" value={staff.id} />
                      <input type="hidden" name="eligible" value={String(!staff.eligible)} />
                      <button type="submit" aria-pressed={staff.eligible} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem] font-semibold ${staff.eligible ? "bg-success-soft text-[color:var(--success)]" : "bg-surface-muted text-muted-foreground"}`}>{staff.eligible ? "Preferred" : "General staff"}</button>
                    </form>
                  </div>
                ))}
                {!currentStaffOptions.length ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">No active staff placements are available today.</p> : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-info-soft px-3 py-2 text-[0.68rem] text-[color:var(--info)]"><CalendarDays className="size-3.5 shrink-0" />Late-arrival discipline remains operational school data and does not alter the official Ministry attendance register.</div>
    </div>
  );
}
