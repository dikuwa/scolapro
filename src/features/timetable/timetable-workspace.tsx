"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CalendarDays, ChevronDown, Clock3, Plus, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { saveAllocation, saveOffering, savePeriod, saveSlot, saveSubject, type TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

const initialState: TimetableActionState = {};
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Option = { value: string; label: string; helper?: string };

function Picker({ label, name, value, onChange, options, placeholder }: { label: string; name: string; value: string; onChange: (value: string) => void; options: Option[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="relative flex min-w-0 flex-col gap-1.5">
      <label className="text-xs font-medium leading-4">{label}</label>
      <input type="hidden" name={name} value={value} />
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-[var(--shadow-xs)] transition hover:border-border">
        <span className={`min-w-0 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-64 overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]">
          {options.length ? options.map((option) => (
            <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }} className={`w-full rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition hover:bg-surface-muted ${option.value === value ? "bg-brand-soft text-brand-strong" : ""}`}>
              <span className="block truncate text-sm font-medium">{option.label}</span>
              {option.helper ? <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">{option.helper}</span> : null}
            </button>
          )) : <p className="px-2.5 py-3 text-xs text-muted-foreground">No options available yet.</p>}
        </div>
      ) : null}
    </div>
  );
}

function useToastState(state: TimetableActionState) {
  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Plus className="size-3.5" aria-hidden="true" />}{pending ? "Saving…" : label}</button>;
}

export function TimetableWorkspaceView({ schoolId, academicYear, canManage, viewerStaffId, workspace }: { schoolId: string; academicYear: number; canManage: boolean; viewerStaffId: string | null; workspace: TimetableWorkspace }) {
  const [subjectState, subjectAction, subjectPending] = useActionState(saveSubject, initialState);
  const [offeringState, offeringAction, offeringPending] = useActionState(saveOffering, initialState);
  const [allocationState, allocationAction, allocationPending] = useActionState(saveAllocation, initialState);
  const [periodState, periodAction, periodPending] = useActionState(savePeriod, initialState);
  const [slotState, slotAction, slotPending] = useActionState(saveSlot, initialState);
  useToastState(subjectState); useToastState(offeringState); useToastState(allocationState); useToastState(periodState); useToastState(slotState);

  const [offeringSubjectId, setOfferingSubjectId] = useState("");
  const [offeringGradeId, setOfferingGradeId] = useState("");
  const [allocationOfferingId, setAllocationOfferingId] = useState("");
  const [allocationClassId, setAllocationClassId] = useState("");
  const [allocationStaffId, setAllocationStaffId] = useState("");
  const [slotDay, setSlotDay] = useState("");
  const [slotPeriodId, setSlotPeriodId] = useState("");
  const [slotClassId, setSlotClassId] = useState("");
  const [slotAllocationId, setSlotAllocationId] = useState("");

  const allocationOffering = workspace.offerings.find((item) => item.id === allocationOfferingId);
  const allocationClassOptions = workspace.classes.filter((item) => !allocationOffering || item.gradeId === allocationOffering.gradeId);
  const slotAllocationOptions = workspace.allocations.filter((item) => !slotClassId || item.classId === slotClassId);
  const visibleSlots = viewerStaffId && !canManage ? workspace.slots.filter((slot) => slot.staffId === viewerStaffId) : workspace.slots;

  const scheduleGroups = useMemo(() => weekdayNames.slice(0, 5).map((day, index) => ({
    day,
    weekday: index + 1,
    slots: visibleSlots.filter((slot) => slot.weekday === index + 1).sort((a, b) => a.periodNumber - b.periodNumber),
  })), [visibleSlots]);

  const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

  return (
    <div className="space-y-5">
      {canManage ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-brand grid size-8 place-items-center rounded-[var(--radius-sm)]"><BookOpenCheck className="size-4" /></span><div><h2 className="text-sm font-semibold">Subjects & offerings</h2><p className="text-xs text-muted-foreground">Define subjects once, then offer them to a grade for {academicYear}.</p></div></div>
            <form action={subjectAction} className="grid gap-3 sm:grid-cols-[0.36fr_1fr_auto] sm:items-end">
              <input type="hidden" name="schoolId" value={schoolId} />
              <div><label htmlFor="subject-code" className="text-xs font-medium">Code</label><input id="subject-code" name="code" placeholder="MATH" className={`${fieldClass} mt-1.5`} /></div>
              <div><label htmlFor="subject-name" className="text-xs font-medium">Subject name</label><input id="subject-name" name="name" placeholder="Mathematics" className={`${fieldClass} mt-1.5`} /></div>
              <SubmitButton pending={subjectPending} label="Add subject" />
            </form>
            <form action={offeringAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <Picker label="Subject" name="subjectId" value={offeringSubjectId} onChange={setOfferingSubjectId} placeholder="Choose subject" options={workspace.subjects.map((item) => ({ value: item.id, label: item.name, helper: item.code }))} />
              <Picker label="Grade" name="gradeId" value={offeringGradeId} onChange={setOfferingGradeId} placeholder="Choose grade" options={workspace.grades.map((item) => ({ value: item.id, label: item.name }))} />
              <div><label htmlFor="periods-cycle" className="text-xs font-medium">Periods per cycle</label><input id="periods-cycle" name="periods" type="number" min="1" max="30" defaultValue="5" className={`${fieldClass} mt-1.5`} /></div>
              <div className="flex items-end"><SubmitButton pending={offeringPending} label="Save offering" /></div>
            </form>
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-mint grid size-8 place-items-center rounded-[var(--radius-sm)]"><UserRoundCheck className="size-4" /></span><div><h2 className="text-sm font-semibold">Teacher allocations</h2><p className="text-xs text-muted-foreground">Connect a teacher to an offered subject and class. This allocation is reused by timetable, marks and planning.</p></div></div>
            <form action={allocationAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <Picker label="Subject offering" name="offeringId" value={allocationOfferingId} onChange={(value) => { setAllocationOfferingId(value); setAllocationClassId(""); }} placeholder="Choose subject and grade" options={workspace.offerings.map((item) => ({ value: item.id, label: item.subjectName, helper: `${item.gradeName} · ${item.periodsPerCycle} periods/cycle` }))} />
              <Picker label="Register class" name="classId" value={allocationClassId} onChange={setAllocationClassId} placeholder="Choose class" options={allocationClassOptions.map((item) => ({ value: item.id, label: item.name, helper: item.gradeName }))} />
              <Picker label="Teacher" name="staffId" value={allocationStaffId} onChange={setAllocationStaffId} placeholder="Choose staff member" options={workspace.staff.map((item) => ({ value: item.id, label: item.name, helper: item.employeeNumber ? `Employee ${item.employeeNumber}` : undefined }))} />
              <div className="flex items-end"><SubmitButton pending={allocationPending} label="Assign teacher" /></div>
            </form>
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-amber grid size-8 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" /></span><div><h2 className="text-sm font-semibold">Teaching periods</h2><p className="text-xs text-muted-foreground">Configure the numbered periods used consistently across the school timetable.</p></div></div>
            <form action={periodAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <div><label htmlFor="period-number" className="text-xs font-medium">Period number</label><input id="period-number" name="number" type="number" min="1" max="30" className={`${fieldClass} mt-1.5`} /></div>
              <div><label htmlFor="period-name" className="text-xs font-medium">Display name</label><input id="period-name" name="name" placeholder="Period 1" className={`${fieldClass} mt-1.5`} /></div>
              <div><label htmlFor="starts-at" className="text-xs font-medium">Starts</label><input id="starts-at" name="startsAt" type="time" className={`${fieldClass} mt-1.5`} /></div>
              <div><label htmlFor="ends-at" className="text-xs font-medium">Ends</label><input id="ends-at" name="endsAt" type="time" className={`${fieldClass} mt-1.5`} /></div>
              <SubmitButton pending={periodPending} label="Save period" />
            </form>
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-sky grid size-8 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" /></span><div><h2 className="text-sm font-semibold">Place timetable slot</h2><p className="text-xs text-muted-foreground">Conflicts are blocked at database level for both classes and teachers.</p></div></div>
            <form action={slotAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <div><label htmlFor="cycle" className="text-xs font-medium">Cycle</label><input id="cycle" name="cycle" defaultValue="A" className={`${fieldClass} mt-1.5`} /></div>
              <Picker label="Day" name="weekday" value={slotDay} onChange={setSlotDay} placeholder="Choose day" options={weekdayNames.slice(0, 5).map((day, index) => ({ value: String(index + 1), label: day }))} />
              <Picker label="Period" name="periodId" value={slotPeriodId} onChange={setSlotPeriodId} placeholder="Choose period" options={workspace.periods.filter((item) => item.isTeaching).map((item) => ({ value: item.id, label: item.name, helper: item.startsAt && item.endsAt ? `${item.startsAt.slice(0,5)}–${item.endsAt.slice(0,5)}` : undefined }))} />
              <Picker label="Class" name="classId" value={slotClassId} onChange={(value) => { setSlotClassId(value); setSlotAllocationId(""); }} placeholder="Choose class" options={workspace.classes.map((item) => ({ value: item.id, label: item.name, helper: item.gradeName }))} />
              <Picker label="Teacher allocation" name="allocationId" value={slotAllocationId} onChange={setSlotAllocationId} placeholder="Choose subject and teacher" options={slotAllocationOptions.map((item) => ({ value: item.id, label: `${item.subjectName} · ${item.staffName}`, helper: item.className }))} />
              <div><label htmlFor="room" className="text-xs font-medium">Room</label><input id="room" name="room" placeholder="Optional" className={`${fieldClass} mt-1.5`} /></div>
              <SubmitButton pending={slotPending} label="Add slot" />
            </form>
          </section>
        </div>
      ) : null}

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold">{viewerStaffId && !canManage ? "My timetable" : "Current timetable"}</h2><p className="mt-1 text-xs text-muted-foreground">Cycle A · {academicYear}. Slots are ordered by school period.</p></div>
          <span className="rounded-[var(--radius-xs)] bg-[color:var(--accent-sky-soft)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--accent-sky)]">{visibleSlots.length} scheduled</span>
        </div>

        {visibleSlots.length ? (
          <div className="grid gap-3 lg:grid-cols-5">
            {scheduleGroups.map((group) => (
              <div key={group.day} className="min-w-0 rounded-[var(--radius-sm)] bg-surface-muted p-3">
                <p className="text-xs font-semibold">{group.day}</p>
                <div className="mt-2 space-y-2">
                  {group.slots.length ? group.slots.map((slot) => (
                    <article key={slot.id} className="rounded-[var(--radius-sm)] bg-surface px-3 py-2.5 shadow-[var(--shadow-xs)]">
                      <div className="flex items-center justify-between gap-2"><span className="text-[0.68rem] font-medium text-brand-strong">{slot.periodName}</span>{slot.roomLabel ? <span className="text-[0.64rem] text-muted-foreground">{slot.roomLabel}</span> : null}</div>
                      <p className="mt-1 text-xs font-semibold">{slot.subjectName}</p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">{slot.className} · {slot.staffName}</p>
                    </article>
                  )) : <p className="py-4 text-center text-[0.68rem] text-muted-foreground">No lessons</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-10 text-center"><p className="text-sm font-medium">No timetable slots yet</p><p className="mt-1 text-xs text-muted-foreground">{canManage ? "Configure subjects, teacher allocations and periods, then add the first slot." : "Your scheduled lessons will appear here once the timetable is configured."}</p></div>
        )}
      </section>
    </div>
  );
}
