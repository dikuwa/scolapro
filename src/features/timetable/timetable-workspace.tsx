"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CalendarDays, ClipboardCheck, Clock3, Plus, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Picker, TimePicker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { saveAllocation, saveOffering, savePeriod, saveSlot, saveSubject, type TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

const initialState: TimetableActionState = {};
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

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
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const allocationOffering = workspace.offerings.find((item) => item.id === allocationOfferingId);
  const allocationClassOptions = workspace.classes.filter((item) => !allocationOffering || item.gradeId === allocationOffering.gradeId);
  const slotAllocationOptions = workspace.allocations.filter((item) => !slotClassId || item.classId === slotClassId);
  const visibleSlots = viewerStaffId && !canManage ? workspace.slots.filter((slot) => slot.staffId === viewerStaffId) : workspace.slots;

  const scheduleGroups = useMemo(() => weekdayNames.map((day, index) => ({ day, weekday: index + 1, slots: visibleSlots.filter((slot) => slot.weekday === index + 1).sort((a, b) => a.periodNumber - b.periodNumber) })), [visibleSlots]);
  const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

  return (
    <div className="space-y-5">
      {canManage ? (
        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-brand grid size-8 place-items-center rounded-[var(--radius-sm)]"><BookOpenCheck className="size-4" /></span><div><h2 className="scolapro-section-title">Subjects & offerings</h2><p className="scolapro-section-description !mt-0">Define subjects once, then offer them to a grade for {academicYear}.</p></div></div>
            <form action={subjectAction} className="grid gap-3 sm:grid-cols-[0.36fr_1fr_auto] sm:items-end">
              <input type="hidden" name="schoolId" value={schoolId} />
              <div><label htmlFor="subject-code" className="text-xs font-medium">Code</label><input id="subject-code" name="code" placeholder="MATH" autoCapitalize="characters" className={`${fieldClass} mt-1.5 uppercase`} /></div>
              <div><label htmlFor="subject-name" className="text-xs font-medium">Subject name</label><input id="subject-name" name="name" placeholder="Mathematics" className={`${fieldClass} mt-1.5`} /></div>
              <SubmitButton pending={subjectPending} label="Add subject" />
            </form>
            <form action={offeringAction} className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <Picker label="Subject" name="subjectId" value={offeringSubjectId} onChange={setOfferingSubjectId} placeholder="Choose subject" options={workspace.subjects.map((item) => ({ value: item.id, label: item.name, helper: item.code.toUpperCase() }))} />
              <Picker label="Grade" name="gradeId" value={offeringGradeId} onChange={setOfferingGradeId} placeholder="Choose grade" options={workspace.grades.map((item) => ({ value: item.id, label: item.name }))} />
              <div><label htmlFor="periods-cycle" className="text-xs font-medium">Periods per cycle</label><input id="periods-cycle" name="periods" type="number" min="1" max="30" defaultValue="5" className={`${fieldClass} mt-1.5`} /></div>
              <div className="flex items-end"><SubmitButton pending={offeringPending} label="Save offering" /></div>
            </form>
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-mint grid size-8 place-items-center rounded-[var(--radius-sm)]"><UserRoundCheck className="size-4" /></span><div><h2 className="scolapro-section-title">Teacher allocations</h2><p className="scolapro-section-description !mt-0">Connect a teacher to an offered subject and class. This allocation is reused by timetable, marks and planning.</p></div></div>
            <form action={allocationAction} className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <Picker label="Subject offering" name="offeringId" value={allocationOfferingId} onChange={(value) => { setAllocationOfferingId(value); setAllocationClassId(""); }} placeholder="Choose subject and grade" options={workspace.offerings.map((item) => ({ value: item.id, label: item.subjectName, helper: `${item.gradeName} · ${item.periodsPerCycle} periods/cycle` }))} />
              <Picker label="Register class" name="classId" value={allocationClassId} onChange={setAllocationClassId} placeholder="Choose class" options={allocationClassOptions.map((item) => ({ value: item.id, label: item.name, helper: item.gradeName }))} />
              <Picker label="Teacher" name="staffId" value={allocationStaffId} onChange={setAllocationStaffId} placeholder="Choose staff member" options={workspace.staff.map((item) => ({ value: item.id, label: item.name, helper: item.employeeNumber ? `Employee ${item.employeeNumber}` : undefined }))} />
              <div className="flex items-end"><SubmitButton pending={allocationPending} label="Assign teacher" /></div>
            </form>
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-amber grid size-8 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" /></span><div><h2 className="scolapro-section-title">Teaching periods</h2><p className="scolapro-section-description !mt-0">Configure numbered periods using ScolaPro time controls rather than browser-native selectors.</p></div></div>
            <form action={periodAction} className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <div><label htmlFor="period-number" className="text-xs font-medium">Period number</label><input id="period-number" name="number" type="number" min="1" max="30" className={`${fieldClass} mt-1.5`} /></div>
              <div><label htmlFor="period-name" className="text-xs font-medium">Display name</label><input id="period-name" name="name" placeholder="Period 1" className={`${fieldClass} mt-1.5`} /></div>
              <TimePicker label="Starts" name="startsAt" value={periodStart} onChange={setPeriodStart} />
              <TimePicker label="Ends" name="endsAt" value={periodEnd} onChange={setPeriodEnd} />
              <SubmitButton pending={periodPending} label="Save period" />
            </form>
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-sky grid size-8 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" /></span><div><h2 className="scolapro-section-title">Place timetable slot</h2><p className="scolapro-section-description !mt-0">Conflicts are blocked at database level for both classes and teachers.</p></div></div>
            <form action={slotAction} className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
              <div><label htmlFor="cycle" className="text-xs font-medium">Cycle</label><input id="cycle" name="cycle" defaultValue="A" className={`${fieldClass} mt-1.5 uppercase`} /></div>
              <Picker label="Day" name="weekday" value={slotDay} onChange={setSlotDay} placeholder="Choose day" options={weekdayNames.map((day, index) => ({ value: String(index + 1), label: day }))} />
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
        <div className="mb-4 flex flex-col gap-2 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="scolapro-section-title">{viewerStaffId && !canManage ? "My timetable" : "Current timetable"}</h2><p className="scolapro-section-description">Cycle A · {academicYear}. Open a teaching slot to record lesson attendance without changing the official morning register.</p></div>
          <span className="rounded-[var(--radius-xs)] bg-[color:var(--accent-sky-soft)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--accent-sky)]">{visibleSlots.length} scheduled</span>
        </div>

        {visibleSlots.length ? (
          <div className="grid gap-3 lg:grid-cols-5">
            {scheduleGroups.map((group) => (
              <div key={group.day} className="min-w-0 rounded-[var(--radius-sm)] bg-surface-muted p-3">
                <p className="text-xs font-semibold text-[color:var(--accent-sky)]">{group.day}</p>
                <div className="mt-2 space-y-2">
                  {group.slots.length ? group.slots.map((slot) => (
                    <article key={slot.id} className="rounded-[var(--radius-sm)] bg-surface px-3 py-2.5 shadow-[var(--shadow-xs)]">
                      <div className="flex items-center justify-between gap-2"><span className="text-[0.68rem] font-medium text-brand-strong">{slot.periodName}</span>{slot.roomLabel ? <span className="text-[0.64rem] text-muted-foreground">{slot.roomLabel}</span> : null}</div>
                      <p className="mt-1 scolapro-record-title">{slot.subjectName}</p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">{slot.className} · {slot.staffName}</p>
                      <Link href={`/attendance/lesson/${slot.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1.5 text-[0.68rem] font-semibold text-brand-strong transition hover:bg-brand-soft/70"><ClipboardCheck className="size-3.5" aria-hidden="true" />Take attendance</Link>
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