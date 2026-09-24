"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, Eye, FileDown, ListOrdered, Plus, Printer, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Picker } from "@/components/ui/picker";
import {
  createPacingPlan,
  createPacingPlanEvent,
  createPacingPlanItem,
  createTeachingScheduleItem,
  updatePacingPlanItem,
  updatePacingPlanStatus,
  updateTeachingScheduleItemStatus,
  type PlanningActionState,
} from "@/features/teaching/server/planning-actions";
import type { TeachingPlanningData } from "@/features/teaching/server/queries";

const emptyState: PlanningActionState = { success: false, message: "" };

// A successful submission clears its own form so the surface cannot invite a
// duplicate of the record just created. The reset happens inside the action
// rather than in an effect: the action settles outside render, so it cannot
// cascade renders the way a setState-inside-an-effect would.

const fieldClass =
  "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-fast)] placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]";

const PLAN_LEVEL_OPTIONS = [
  { value: "department", label: "Department" },
  { value: "class", label: "Class" },
];

const PRIORITY_OPTIONS = [
  { value: "essential", label: "Essential" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "extension", label: "Extension" },
];

const PLAN_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "superseded", label: "Superseded" },
  { value: "archived", label: "Archived" },
];

const LESSON_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "moved", label: "Moved" },
  { value: "cancelled", label: "Cancelled" },
];

function ActionMessage({ state }: { state: PlanningActionState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={
        state.success
          ? "rounded-[var(--radius-sm)] bg-success-soft/60 px-3 py-2 text-xs text-[color:var(--success)]"
          : "rounded-[var(--radius-sm)] bg-danger-soft/60 px-3 py-2 text-xs text-[color:var(--danger)]"
      }
    >
      {state.message}
    </p>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-brand-strong" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="scolapro-section-title">{title}</h2>
          <p className="scolapro-section-description">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Governed authoring surface for the connected teaching plan.
 *
 * Everything here writes the one canonical plan chain
 * (subject_offerings -> pacing_plans -> pacing_plan_items ->
 * teaching_schedule_items). The year planner and scheme of work on /teaching
 * remain read views of the same rows; this route adds no second store and never
 * edits official curriculum registry content.
 */
export function PlanningWorkspace({ data }: { data: TeachingPlanningData }) {
  const termOptions = useMemo(
    () => data.terms.map((term) => ({ value: term.id, label: term.name, helper: term.startsOn && term.endsOn ? `${term.startsOn} – ${term.endsOn}` : term.status })),
    [data.terms],
  );
  const unitOptions = useMemo(
    () =>
      data.units.map((unit) => ({
        value: unit.unitId,
        label: `${unit.unitCode} — ${unit.topic}`,
        helper: unit.theme ?? undefined,
      })),
    [data.units],
  );

  const classOptions = useMemo(
    () =>
      data.classes.map((item) => ({
        value: item.classId,
        label: item.className,
        helper: item.gradeName,
        gradeId: item.gradeId,
      })),
    [data.classes],
  );

  const planOptions = useMemo(
    () =>
      data.planSummaries.map((plan) => ({
        value: plan.planId,
        label: `${plan.subjectName}${plan.className ? ` · ${plan.className}` : ""}`,
        helper: `${plan.planLevel} · ${plan.status} · ${plan.itemCount} item${plan.itemCount === 1 ? "" : "s"} · ${plan.scheduledCount} scheduled`,
      })),
    [data.planSummaries],
  );

  const itemOptions = useMemo(
    () =>
      data.planItems.map((item) => ({
        value: item.itemId,
        label: `${item.unitCode} — ${item.topic}`,
        helper: `${item.planLevel} · ${item.plannedPeriods} period${item.plannedPeriods === 1 ? "" : "s"} · sequence ${item.sequenceNumber}`,
      })),
    [data.planItems],
  );

  const itemLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of data.planItems) map.set(item.itemId, `${item.unitCode} — ${item.topic}`);
    return map;
  }, [data.planItems]);

  const lessonOptions = useMemo(
    () =>
      data.scheduleItems.map((lesson) => ({
        value: lesson.itemId,
        label: `${itemLabelById.get(lesson.planItemId) ?? "Lesson"} · ${lesson.plannedOn}`,
        helper: `${lesson.plannedPeriodCount} period${lesson.plannedPeriodCount === 1 ? "" : "s"} · ${lesson.status}${lesson.movedTo ? ` · moved to ${lesson.movedTo}` : ""}`,
      })),
    [data.scheduleItems, itemLabelById],
  );

  // ---- create plan -------------------------------------------------------
  const [planForm, setPlanForm] = useState({
    offeringId: "",
    planLevel: "department",
    registerClassId: "",
    teacherAllocationId: "",
    curriculumUnitId: "",
  });
  const classOptionsForOffering = useMemo(() => {
    const offering = data.planningOfferings.find(
      (item) => item.offeringId === planForm.offeringId,
    );
    return offering
      ? classOptions.filter((item) => item.gradeId === offering.gradeId)
      : classOptions;
  }, [classOptions, data.planningOfferings, planForm.offeringId]);
  const [planState, planAction, planPending] = useActionState(
    async (state: PlanningActionState, form: FormData) => {
      const result = await createPacingPlan(state, form);
      if (result.success) {
        setPlanForm({
          offeringId: "",
          planLevel: "department",
          registerClassId: "",
          teacherAllocationId: "",
          curriculumUnitId: "",
        });
      }
      return result;
    },
    emptyState,
  );

  // ---- plan status -------------------------------------------------------
  const [statusForm, setStatusForm] = useState({ planId: "", status: "draft" });
  const [statusState, statusAction, statusPending] = useActionState(updatePacingPlanStatus, emptyState);

  // ---- add plan item -----------------------------------------------------
  const [itemForm, setItemForm] = useState({
    planId: "",
    curriculumUnitId: "",
    plannedStartOn: "",
    plannedEndOn: "",
    plannedPeriods: 1,
    priority: "normal",
    sequenceNumber: 100,
    notes: "",
    academicTermId: "",
    completedOn: "",
  });
  const [itemState, itemAction, itemPending] = useActionState(
    async (state: PlanningActionState, form: FormData) => {
      const result = await createPacingPlanItem(state, form);
      if (result.success) {
        // The chosen plan is kept: consecutive units usually belong to one plan.
        setItemForm((current) => ({
          ...current,
          curriculumUnitId: "",
          plannedStartOn: "",
          plannedEndOn: "",
          plannedPeriods: 1,
          priority: "normal",
          sequenceNumber: 100,
          notes: "",
          academicTermId: "",
          completedOn: "",
        }));
      }
      return result;
    },
    emptyState,
  );

  // ---- edit plan item ----------------------------------------------------
  const [editForm, setEditForm] = useState({
    itemId: "",
    plannedStartOn: "",
    plannedEndOn: "",
    plannedPeriods: 1,
    priority: "normal",
    sequenceNumber: 100,
    notes: "",
    academicTermId: "",
    completedOn: "",
  });
  const [editState, editAction, editPending] = useActionState(updatePacingPlanItem, emptyState);

  // ---- schedule a lesson -------------------------------------------------
  const [lessonForm, setLessonForm] = useState({
    planItemId: "",
    registerClassId: "",
    teacherAllocationId: "",
    plannedOn: "",
    plannedPeriodCount: 1,
  });
  const [lessonState, lessonAction, lessonPending] = useActionState(
    async (state: PlanningActionState, form: FormData) => {
      const result = await createTeachingScheduleItem(state, form);
      // Only the date is cleared: the chosen item, class and allocation are the
      // ones the next lesson in a sequence will normally reuse.
      if (result.success) setLessonForm((current) => ({ ...current, plannedOn: "" }));
      return result;
    },
    emptyState,
  );

  // ---- lesson status -----------------------------------------------------
  const [lessonStatusForm, setLessonStatusForm] = useState({
    scheduleItemId: "",
    status: "planned",
    movedToDate: "",
  });
  const [lessonStatusState, lessonStatusAction, lessonStatusPending] = useActionState(
    updateTeachingScheduleItemStatus,
    emptyState,
  );

  const [eventForm, setEventForm] = useState({
    planId: "",
    academicTermId: "",
    eventTitle: "",
    eventNotes: "",
    eventStartsOn: "",
    eventEndsOn: "",
  });
  const [eventState, eventAction, eventPending] = useActionState(
    async (state: PlanningActionState, form: FormData) => {
      const result = await createPacingPlanEvent(state, form);
      if (result.success) {
        setEventForm((current) => ({ ...current, eventTitle: "", eventNotes: "", eventStartsOn: "", eventEndsOn: "" }));
      }
      return result;
    },
    emptyState,
  );

  const offeringOptions = useMemo(
    () =>
      data.planningOfferings.map((offering) => {
        const allocationClasses = data.planningAllocations
          .filter((allocation) => allocation.offeringId === offering.offeringId)
          .map((allocation) => allocation.className)
          .filter(Boolean);
        const classes = [...new Set(allocationClasses)].join(", ");
        return {
          value: offering.offeringId,
          label: offering.subjectName,
          helper: `${offering.gradeName}${classes ? ` · ${classes}` : ""}${offering.curriculumVersionId ? "" : " · Curriculum link pending"}`,
        };
      }),
    [data.planningAllocations, data.planningOfferings],
  );

  // A teacher allocation can only be tied to a plan for its own offering.
  const allocationOptionsForOffering = (offeringId: string) =>
    data.planningAllocations
      .filter((allocation) => allocation.offeringId === offeringId)
      .map((allocation) => ({
        value: allocation.allocationId,
        label: `${allocation.subjectName} · ${allocation.className ?? "No register class"}`,
        helper: `${allocation.gradeName} · effective ${allocation.activeFrom} → ${allocation.activeTo ?? "open"}`,
      }));

  const hasOfferings = data.planningOfferings.length > 0;
  const hasUnits = unitOptions.length > 0;
  const hasPlans = planOptions.length > 0;
  const hasItems = itemOptions.length > 0;
  const canAuthor = hasOfferings && hasUnits;

  return (
    <div className="space-y-5">
      {!canAuthor && (
        <p className="rounded-[var(--radius-sm)] bg-warning-soft/60 px-3 py-2.5 text-xs text-[color:var(--warning)]">
          {hasOfferings
            ? "No curriculum units are in scope, so nothing can be authored yet. Curriculum registry content is published centrally."
            : `No active subject offering is currently in scope for the school's academic year (${data.academicYear}), so there is no plan to author yet.`}
        </p>
      )}

      {/* ---- pacing plan ---- */}
      <Section
        icon={<Route className="size-4" />}
        title="Pacing plan"
        description="Create a department or class plan layer for one subject offering. National baseline layers are authored centrally, not by a school."
      >
        <div className="mt-4 space-y-3">
          <ActionMessage state={planState} />
          <form action={planAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Picker
              label="Subject offering"
              name="offeringId"
              value={planForm.offeringId}
              onChange={(value) =>
                setPlanForm((current) => ({
                  ...current,
                  offeringId: value,
                  teacherAllocationId: "",
                }))
              }
              options={offeringOptions}
              placeholder="Select offering"
              searchable
              disabled={!hasOfferings || planPending}
            />
            <Picker
              label="Plan level"
              name="planLevel"
              value={planForm.planLevel}
              onChange={(value) => setPlanForm((current) => ({ ...current, planLevel: value }))}
              options={data.isTeacher ? PLAN_LEVEL_OPTIONS.filter((option) => option.value === "department") : PLAN_LEVEL_OPTIONS}
              placeholder="Department"
              disabled={planPending}
            />
            {planForm.planLevel === "class" && (
              <Picker
                label="Register class"
                name="registerClassId"
                value={planForm.registerClassId}
                onChange={(value) => setPlanForm((current) => ({ ...current, registerClassId: value }))}
                options={classOptionsForOffering}
                placeholder="Select class"
                disabled={classOptionsForOffering.length === 0 || planPending}
              />
            )}
            {planForm.planLevel === "class" ? (
              <Picker
                label="Variant teacher allocation (optional)"
                name="teacherAllocationId"
                value={planForm.teacherAllocationId}
                onChange={(value) =>
                  setPlanForm((current) => ({ ...current, teacherAllocationId: value }))
                }
                options={allocationOptionsForOffering(planForm.offeringId)}
                placeholder="Leave unassigned"
                disabled={!planForm.offeringId || planPending}
              />
            ) : <input type="hidden" name="teacherAllocationId" value="" />}
            <Picker
              label="Curriculum unit"
              name="curriculumUnitId"
              value={planForm.curriculumUnitId}
              onChange={(value) => setPlanForm((current) => ({ ...current, curriculumUnitId: value }))}
              options={unitOptions}
              placeholder="Select unit"
              searchable
              disabled={!hasUnits || planPending}
            />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" loading={planPending} disabled={!canAuthor}>
                <Plus className="size-4" aria-hidden="true" />
                Create plan
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setPlanForm({
                    offeringId: "",
                    planLevel: "department",
                    registerClassId: "",
                    teacherAllocationId: "",
                    curriculumUnitId: "",
                  })
                }
              >
                Reset
              </Button>
            </div>
          </form>
        </div>

        {hasPlans ? (
          <div className="mt-5 border-t border-border-subtle pt-4">
            <h3 className="scolapro-record-title">Existing plans</h3>
            <ul className="mt-2 divide-y divide-border-subtle">
              {data.planSummaries.map((plan) => (
                <li key={plan.planId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="text-sm font-medium text-foreground">
                    {plan.subjectName}
                    {plan.className ? ` · ${plan.className}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {plan.planLevel === "department" ? "Shared subject/grade plan" : "Explicit class pacing variant"} · {plan.status} · {plan.gradeName} · {plan.itemCount} item
                    {plan.itemCount === 1 ? "" : "s"} · {plan.scheduledCount} scheduled
                  </span>
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <a className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-xs font-medium" href={`/api/official-documents/teaching-plan?plan=${plan.planId}&view=year-planner&format=html`} target="_blank" rel="noreferrer"><Eye className="size-3.5" /> Preview</a>
                    <a className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-xs font-medium" href={`/api/official-documents/teaching-plan?plan=${plan.planId}&view=year-planner&format=html&print=1`} target="_blank" rel="noreferrer"><Printer className="size-3.5" /> Print</a>
                    <a className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-xs font-medium text-brand-strong" href={`/api/official-documents/teaching-plan?plan=${plan.planId}&view=scheme&format=pdf`}><FileDown className="size-3.5" /> PDF</a>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-border-subtle pt-4">
              <ActionMessage state={statusState} />
              <form action={statusAction} className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Picker
                  label="Plan"
                  name="planId"
                  value={statusForm.planId}
                  onChange={(value) => setStatusForm((current) => ({ ...current, planId: value }))}
                  options={planOptions}
                  placeholder="Select plan"
                  disabled={statusPending}
                />
                <Picker
                  label="Status"
                  name="status"
                  value={statusForm.status}
                  onChange={(value) => setStatusForm((current) => ({ ...current, status: value }))}
                  options={PLAN_STATUS_OPTIONS}
                  placeholder="Draft"
                  disabled={statusPending}
                />
                <div className="flex items-end">
                  <Button type="submit" variant="soft" loading={statusPending} disabled={!statusForm.planId}>
                    Set plan status
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <p className="mt-4 border-t border-border-subtle pt-4 text-xs text-muted-foreground">
            No plan exists for the current academic year yet.
          </p>
        )}
      </Section>

      {/* ---- plan items ---- */}
      <Section
        icon={<ListOrdered className="size-4" />}
        title="Plan items"
        description="Sequence official curriculum units with planned start and end dates, planned periods and priority. This is the scheme of work the lesson-preparation flow derives from."
      >
        <div className="mt-4 space-y-3">
          <ActionMessage state={itemState} />
          <form action={itemAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Picker
              label="Plan"
              name="planId"
              value={itemForm.planId}
              onChange={(value) => setItemForm((current) => ({ ...current, planId: value }))}
              options={planOptions}
              placeholder="Select plan"
              disabled={!hasPlans || itemPending}
            />
            <Picker
              label="Curriculum unit"
              name="curriculumUnitId"
              value={itemForm.curriculumUnitId}
              onChange={(value) => setItemForm((current) => ({ ...current, curriculumUnitId: value }))}
              options={unitOptions}
              placeholder="Select unit"
              searchable
              disabled={!hasUnits || itemPending}
            />
            <DateField
              label="Planned start"
              name="plannedStartOn"
              value={itemForm.plannedStartOn}
              onChange={(value) => setItemForm((current) => ({ ...current, plannedStartOn: value }))}
            />
            <Picker
              label="Term placement"
              name="academicTermId"
              value={itemForm.academicTermId ?? ""}
              onChange={(value) => setItemForm((current) => ({ ...current, academicTermId: value }))}
              options={termOptions}
              placeholder="Select term"
              disabled={!termOptions.length || itemPending}
            />
            <DateField
              label="Completed date"
              name="completedOn"
              value={itemForm.completedOn ?? ""}
              onChange={(value) => setItemForm((current) => ({ ...current, completedOn: value }))}
            />
            <DateField
              label="Planned end"
              name="plannedEndOn"
              value={itemForm.plannedEndOn}
              onChange={(value) => setItemForm((current) => ({ ...current, plannedEndOn: value }))}
            />
            <NumberStepper
              label="Planned periods"
              name="plannedPeriods"
              min={1}
              max={999}
              value={itemForm.plannedPeriods}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, plannedPeriods: Number(event.target.value) }))
              }
            />
            <NumberStepper
              label="Sequence order"
              name="sequenceNumber"
              min={1}
              max={9999}
              value={itemForm.sequenceNumber}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, sequenceNumber: Number(event.target.value) }))
              }
            />
            <Picker
              label="Priority"
              name="priority"
              value={itemForm.priority}
              onChange={(value) => setItemForm((current) => ({ ...current, priority: value }))}
              options={PRIORITY_OPTIONS}
              placeholder="Normal"
              disabled={itemPending}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium" htmlFor="plan-item-notes">
                Notes
              </label>
              <textarea
                id="plan-item-notes"
                name="notes"
                rows={3}
                className={`${fieldClass} resize-y py-2`}
                value={itemForm.notes}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Optional planning note for this item."
              />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" loading={itemPending} disabled={!hasPlans || !hasUnits}>
                <Plus className="size-4" aria-hidden="true" />
                Add plan item
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setItemForm((current) => ({
                    ...current,
                    curriculumUnitId: "",
                    plannedStartOn: "",
                    plannedEndOn: "",
                    plannedPeriods: 1,
                    priority: "normal",
                    sequenceNumber: 100,
                    notes: "",
                    academicTermId: "",
                    completedOn: "",
                  }))
                }
              >
                Reset
              </Button>
            </div>
          </form>
        </div>

        {hasItems ? (
          <div className="mt-5 border-t border-border-subtle pt-4">
            <h3 className="scolapro-record-title">Adjust a planned item</h3>
            <p className="scolapro-section-description">
              Change the planned dates, periods, order and priority. The curriculum unit and the parent plan stay fixed so the scheme of work keeps its registry alignment.
            </p>
            <ActionMessage state={editState} />
            <form action={editAction} className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Picker
                label="Plan item"
                name="itemId"
                value={editForm.itemId}
                onChange={(value) => {
                  const item = data.planItems.find((row) => row.itemId === value);
                  setEditForm((current) => ({
                    ...current,
                    itemId: value,
                    plannedStartOn: item?.plannedStartOn ?? "",
                    plannedEndOn: item?.plannedEndOn ?? "",
                    plannedPeriods: item?.plannedPeriods ?? 1,
                    priority: item?.priority ?? "normal",
                    sequenceNumber: item?.sequenceNumber ?? 100,
                    academicTermId: item?.termId ?? "",
                    completedOn: item?.completedOn ?? "",
                  }));
                }}
                options={itemOptions}
                placeholder="Select plan item"
                searchable
                disabled={editPending}
              />
              <DateField
                label="Planned start"
                name="plannedStartOn"
                value={editForm.plannedStartOn}
                onChange={(value) => setEditForm((current) => ({ ...current, plannedStartOn: value }))}
              />
              <DateField
                label="Planned end"
                name="plannedEndOn"
                value={editForm.plannedEndOn}
                onChange={(value) => setEditForm((current) => ({ ...current, plannedEndOn: value }))}
              />
              <NumberStepper
                label="Planned periods"
                name="plannedPeriods"
                min={1}
                max={999}
                value={editForm.plannedPeriods}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, plannedPeriods: Number(event.target.value) }))
                }
              />
              <NumberStepper
                label="Sequence order"
                name="sequenceNumber"
                min={1}
                max={9999}
                value={editForm.sequenceNumber}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, sequenceNumber: Number(event.target.value) }))
                }
              />
              <Picker
                label="Priority"
                name="priority"
                value={editForm.priority}
                onChange={(value) => setEditForm((current) => ({ ...current, priority: value }))}
                options={PRIORITY_OPTIONS}
                placeholder="Normal"
                disabled={editPending}
              />
              <Picker
                label="Term placement"
                name="academicTermId"
                value={editForm.academicTermId ?? ""}
                onChange={(value) => setEditForm((current) => ({ ...current, academicTermId: value }))}
                options={termOptions}
                placeholder="Select term"
                disabled={!termOptions.length || editPending}
              />
              <DateField
                label="Completed date"
                name="completedOn"
                value={editForm.completedOn ?? ""}
                onChange={(value) => setEditForm((current) => ({ ...current, completedOn: value }))}
              />
              <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
                <Button type="submit" variant="soft" loading={editPending} disabled={!editForm.itemId}>
                  Save plan item
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <p className="mt-4 border-t border-border-subtle pt-4 text-xs text-muted-foreground">
            Add a plan item before adjusting one.
          </p>
        )}
      </Section>

      <Section
        icon={<CalendarPlus className="size-4" />}
        title="Local planning events"
        description="Add teacher planning notes, assessment preparation or revision windows to this plan. These annotations do not change the authoritative school calendar or timetable cycle."
      >
        <div className="mt-4 space-y-3">
          <ActionMessage state={eventState} />
          <form action={eventAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Picker label="Plan" name="planId" value={eventForm.planId} onChange={(value) => setEventForm((current) => ({ ...current, planId: value }))} options={planOptions} placeholder="Select plan" disabled={!hasPlans || eventPending} />
            <Picker label="Term" name="academicTermId" value={eventForm.academicTermId} onChange={(value) => setEventForm((current) => ({ ...current, academicTermId: value }))} options={termOptions} placeholder="Select term" disabled={!termOptions.length || eventPending} />
            <div><label className="block text-xs font-medium" htmlFor="planning-event-title">Event / note</label><input id="planning-event-title" name="eventTitle" className={fieldClass} value={eventForm.eventTitle} onChange={(event) => setEventForm((current) => ({ ...current, eventTitle: event.target.value }))} maxLength={160} placeholder="Revision week" /></div>
            <DateField label="Starts" name="eventStartsOn" value={eventForm.eventStartsOn} onChange={(value) => setEventForm((current) => ({ ...current, eventStartsOn: value }))} />
            <DateField label="Ends" name="eventEndsOn" value={eventForm.eventEndsOn} onChange={(value) => setEventForm((current) => ({ ...current, eventEndsOn: value }))} />
            <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium" htmlFor="planning-event-notes">Planning note</label><textarea id="planning-event-notes" name="eventNotes" rows={2} className={`${fieldClass} resize-y py-2`} value={eventForm.eventNotes} onChange={(event) => setEventForm((current) => ({ ...current, eventNotes: event.target.value }))} maxLength={2000} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" loading={eventPending} disabled={!eventForm.planId || !eventForm.eventTitle || !eventForm.eventStartsOn || !eventForm.eventEndsOn}><Plus className="size-4" /> Add planning event</Button></div>
          </form>
          {data.planEvents.length ? <ul className="divide-y divide-border-subtle border-t border-border-subtle pt-2">{data.planEvents.map((event) => <li key={event.eventId} className="py-2"><p className="scolapro-record-title">{event.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{event.startsOn}{event.endsOn !== event.startsOn ? ` – ${event.endsOn}` : ""}{event.notes ? ` · ${event.notes}` : ""}</p></li>)}</ul> : <p className="text-xs text-muted-foreground">No local planning events yet.</p>}
        </div>
      </Section>

      {/* ---- lesson scheduling ---- */}
      <Section
        icon={<CalendarClock className="size-4" />}
        title="Lesson scheduling"
        description="Create real lesson occurrences from plan items and record a move or cancellation. A lesson date must fall inside the effective window of the teacher allocation it names."
      >
        <div className="mt-4 space-y-3">
          <ActionMessage state={lessonState} />
          <form action={lessonAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Picker
              label="Plan item"
              name="planItemId"
              value={lessonForm.planItemId}
              onChange={(value) => setLessonForm((current) => ({ ...current, planItemId: value }))}
              options={itemOptions}
              placeholder="Select plan item"
              searchable
              disabled={!hasItems || lessonPending}
            />
            <Picker
              label="Register class"
              name="registerClassId"
              value={lessonForm.registerClassId}
              onChange={(value) =>
                setLessonForm((current) => ({
                  ...current,
                  registerClassId: value,
                  teacherAllocationId: "",
                }))
              }
              options={classOptions}
              placeholder="Select class"
              disabled={classOptions.length === 0 || lessonPending}
            />
            <Picker
              label="Teacher allocation"
              name="teacherAllocationId"
              value={lessonForm.teacherAllocationId}
              onChange={(value) =>
                setLessonForm((current) => ({ ...current, teacherAllocationId: value }))
              }
              options={data.planningAllocations
                .filter((allocation) => allocation.classId === lessonForm.registerClassId)
                .map((allocation) => ({
                  value: allocation.allocationId,
                  label: allocation.subjectName,
                  helper: `${allocation.gradeName} · effective ${allocation.activeFrom} → ${allocation.activeTo ?? "open"}`,
                }))}
              placeholder="Select allocation"
              disabled={!lessonForm.registerClassId || lessonPending}
            />
            <DateField
              label="Planned on"
              name="plannedOn"
              value={lessonForm.plannedOn}
              onChange={(value) => setLessonForm((current) => ({ ...current, plannedOn: value }))}
            />
            <NumberStepper
              label="Periods"
              name="plannedPeriodCount"
              min={1}
              max={99}
              value={lessonForm.plannedPeriodCount}
              onChange={(event) =>
                setLessonForm((current) => ({
                  ...current,
                  plannedPeriodCount: Number(event.target.value),
                }))
              }
            />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" loading={lessonPending} disabled={!hasItems}>
                <Plus className="size-4" aria-hidden="true" />
                Schedule lesson
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setLessonForm((current) => ({ ...current, plannedOn: "" }))
                }
              >
                Reset
              </Button>
            </div>
          </form>
        </div>

        {lessonOptions.length > 0 ? (
          <div className="mt-5 border-t border-border-subtle pt-4">
            <h3 className="scolapro-record-title">Adjust a scheduled lesson</h3>
            <p className="scolapro-section-description">
              Moving a lesson records the date it moved to. The original planned date is never rewritten.
            </p>
            <ActionMessage state={lessonStatusState} />
            <form action={lessonStatusAction} className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Picker
                label="Lesson"
                name="scheduleItemId"
                value={lessonStatusForm.scheduleItemId}
                onChange={(value) => {
                  const lesson = data.scheduleItems.find((row) => row.itemId === value);
                  setLessonStatusForm((current) => ({
                    ...current,
                    scheduleItemId: value,
                    status: lesson?.status ?? "planned",
                    movedToDate: lesson?.movedTo ?? "",
                  }));
                }}
                options={lessonOptions}
                placeholder="Select lesson"
                searchable
                disabled={lessonStatusPending}
              />
              <Picker
                label="Status"
                name="status"
                value={lessonStatusForm.status}
                onChange={(value) =>
                  setLessonStatusForm((current) => ({ ...current, status: value }))
                }
                options={LESSON_STATUS_OPTIONS}
                placeholder="Planned"
                disabled={lessonStatusPending}
              />
              {lessonStatusForm.status === "moved" && (
                <DateField
                  label="Moved to"
                  name="movedToDate"
                  value={lessonStatusForm.movedToDate}
                  onChange={(value) =>
                    setLessonStatusForm((current) => ({ ...current, movedToDate: value }))
                  }
                  required
                />
              )}
              <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
                <Button
                  type="submit"
                  variant="soft"
                  loading={lessonStatusPending}
                  disabled={!lessonStatusForm.scheduleItemId}
                >
                  Save lesson status
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <p className="mt-4 border-t border-border-subtle pt-4 text-xs text-muted-foreground">
            No lesson occurrence has been scheduled for the current academic year yet.
          </p>
        )}
      </Section>
    </div>
  );
}
