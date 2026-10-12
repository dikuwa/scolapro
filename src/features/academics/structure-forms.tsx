"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { ClassManagement, type RegisterClass } from "@/features/academics/class-management";
import { saveGrade, saveRegisterClass, type AcademicStructureState } from "@/features/academics/server/actions";

const initialState: AcademicStructureState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

type GradeTab = "grade" | "class";

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

function gradeCode(code: string, name: string) {
  const normalized = /^\d+$/.test(code) ? `G${code}` : code.toUpperCase();
  const numberFromName = name.match(/\b(\d{1,2})\b/)?.[1];
  return numberFromName && normalized === `G${numberFromName}` ? normalized : normalized;
}

/**
 * Combined Grade & Class management card.
 *
 * Issue #1233 replaces the two separate add/update cards (grades, register
 * classes) with one card. Each tab owns the relevant management controls and
 * its slice of the register structure, so there is exactly one add/update form
 * and one structure view per entity.
 */
export function AcademicStructureForms({
  schoolId,
  academicYear,
  grades,
  rooms,
  classes,
  staff,
  canEditStructure = true,
}: {
  schoolId: string;
  academicYear: number;
  grades: { id: string; code: string; name: string }[];
  rooms: { id: string; code: string; name: string; block: string | null }[];
  classes: RegisterClass[];
  staff: { staffMemberId: string; staffName: string; employeeNumber: string | null }[];
  canEditStructure?: boolean;
}) {
  const [gradeState, gradeAction, gradePending] = useActionState(saveGrade, initialState);
  const [classState, classAction, classPending] = useActionState(saveRegisterClass, initialState);
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const [homeRoomId, setHomeRoomId] = useState("");
  const [openPanel, setOpenPanel] = useState<"grade" | "class" | null>(null);
  const [tab, setTab] = useState<GradeTab>("grade");

  const sharedRoomWarning = useMemo(() => {
    if (!homeRoomId) return null;
    const existing = classes.find((item) => item.homeRoom?.id === homeRoomId);
    return existing
      ? `${existing.name} already uses this home room. Shared rooms are allowed — save to confirm, or choose another room.`
      : null;
  }, [classes, homeRoomId]);

  useEffect(() => {
    if (!gradeState.message) return;
    if (gradeState.success) {
      toast.success(gradeState.message);
      queueMicrotask(() => setOpenPanel(null));
    } else toast.error(gradeState.message);
  }, [gradeState]);

  useEffect(() => {
    if (!classState.message) return;
    if (classState.success) {
      toast.success(classState.message);
      queueMicrotask(() => setOpenPanel(null));
    } else toast.error(classState.message);
  }, [classState]);

  const tabs: { value: GradeTab; label: string; panelId: string }[] = [
    { value: "grade", label: "Grades", panelId: "grade-class-grades-panel" },
    { value: "class", label: "Classes", panelId: "grade-class-classes-panel" },
  ];

  const selectTab = (next: GradeTab) => {
    setTab(next);
    setOpenPanel(null);
  };

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="scolapro-section-title">Grade &amp; class management</h2>
          <p className="scolapro-section-description">
            Grades and register classes for {academicYear}. Register classes belong to one configured grade and are reused by
            enrolment, attendance, class-lists and class-teacher workflows.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Grade and class management view"
          className="flex min-h-10 w-full items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1 sm:w-fit"
        >
          {tabs.map(({ value, label, panelId }) => (
            <button
              key={value}
              id={`grade-class-${value}-tab`}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls={panelId}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => selectTab(value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  selectTab(value === "grade" ? "class" : "grade");
                }
              }}
              className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/35 sm:flex-none ${tab === value ? "bg-brand-soft text-brand-strong shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "grade" ? (
        <div id="grade-class-grades-panel" role="tabpanel" aria-labelledby="grade-class-grade-tab" className="mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              Grades belong to this school and academic year. Use short, stable uppercase codes such as G8, G9 or G10.
            </p>
            {canEditStructure ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  aria-expanded={openPanel === "grade"}
                  onClick={() => setOpenPanel((current) => (current === "grade" ? null : "grade"))}
                >
                  {openPanel === "grade" ? <X className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                  {openPanel === "grade" ? "Close" : "Add / update grade"}
                </Button>
              </div>
            ) : null}
          </div>

          {canEditStructure && openPanel === "grade" ? (
            <form action={gradeAction} className="mt-3 space-y-4 border-t border-border-subtle pt-4" noValidate>
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="academicYear" value={academicYear} />
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <div>
                  <label htmlFor="gradeCode" className="text-xs font-medium">Grade code</label>
                  <input id="gradeCode" name="gradeCode" className={`${fieldClass} mt-1.5 uppercase`} placeholder="G8" autoCapitalize="characters" />
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">Stored as an uppercase identifier.</p>
                  <FieldError messages={gradeState.fieldErrors?.gradeCode} />
                </div>
                <div>
                  <label htmlFor="gradeName" className="text-xs font-medium">Display name</label>
                  <input id="gradeName" name="displayName" className={`${fieldClass} mt-1.5`} placeholder="Grade 8" />
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">Human-readable label shown throughout ScolaPro.</p>
                  <FieldError messages={gradeState.fieldErrors?.displayName} />
                </div>
              </div>
              <div className="flex justify-end border-t border-border-subtle pt-4">
                <button type="submit" disabled={gradePending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
                  {gradePending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                  {gradePending ? "Saving…" : "Save grade"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="mt-4 max-h-[33rem] overflow-y-auto overscroll-contain pr-1">
            <ClassManagement grades={grades} classes={classes} rooms={rooms} staff={staff} canEditStructure={canEditStructure} view="grades" />
          </div>
        </div>
      ) : (
        <div id="grade-class-classes-panel" role="tabpanel" aria-labelledby="grade-class-class-tab" className="mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              Register classes belong to one configured grade. Home room is optional and shared rooms are allowed.
            </p>
            {canEditStructure ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  aria-expanded={openPanel === "class"}
                  onClick={() => setOpenPanel((current) => (current === "class" ? null : "class"))}
                >
                  {openPanel === "class" ? <X className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                  {openPanel === "class" ? "Close" : "Add register class"}
                </Button>
              </div>
            ) : null}
          </div>

          {canEditStructure && openPanel === "class" ? (
            <form action={classAction} className="mt-3 space-y-4 border-t border-border-subtle pt-4" noValidate>
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="academicYear" value={academicYear} />

              <Picker
                label="Grade"
                name="gradeId"
                value={gradeId}
                onChange={setGradeId}
                placeholder="Configure a grade first"
                disabled={!grades.length}
                options={grades.map((grade) => ({ value: grade.id, label: grade.name, helper: gradeCode(grade.code, grade.name) }))}
              />
              <FieldError messages={classState.fieldErrors?.gradeId} />

              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <div>
                  <label htmlFor="classCode" className="text-xs font-medium">Class code</label>
                  <input id="classCode" name="classCode" className={`${fieldClass} mt-1.5 uppercase`} placeholder="10A" autoCapitalize="characters" />
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">Short uppercase identifier, for example 10A.</p>
                  <FieldError messages={classState.fieldErrors?.classCode} />
                </div>
                <div>
                  <label htmlFor="className" className="text-xs font-medium">Display name</label>
                  <input id="className" name="displayName" className={`${fieldClass} mt-1.5`} placeholder="Grade 10/A" />
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">Shown to teachers, learners and administrators.</p>
                  <FieldError messages={classState.fieldErrors?.displayName} />
                </div>
              </div>

              <div>
                <Picker
                  label="Home room"
                  name="homeRoomId"
                  value={homeRoomId}
                  onChange={setHomeRoomId}
                  placeholder="Optional — links to a same-school room"
                  disabled={!rooms.length}
                  searchable
                  searchPlaceholder="Search rooms"
                  options={rooms.map((room) => ({
                    value: room.id,
                    label: room.name,
                    helper: room.block ? `${room.block} · ${room.code}` : room.code,
                  }))}
                />
                {sharedRoomWarning ? (
                  <p role="status" className="mt-1.5 flex items-start gap-1.5 rounded-[var(--radius-xs)] bg-warning-soft/60 px-2.5 py-1.5 text-[0.68rem] leading-5 text-[color:var(--warning)]">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>{sharedRoomWarning}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">
                    {rooms.length} room{rooms.length === 1 ? " is" : "s are"} configured for this school. Register teacher remains a separate field.
                  </p>
                )}
              </div>

              <div className="flex justify-end border-t border-border-subtle pt-4">
                <button type="submit" disabled={classPending || !grades.length} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
                  {classPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                  {classPending ? "Saving…" : "Save class"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="mt-4 max-h-[33rem] overflow-y-auto overscroll-contain pr-1">
            <ClassManagement grades={grades} classes={classes} rooms={rooms} staff={staff} canEditStructure={canEditStructure} view="classes" />
          </div>
        </div>
      )}
    </section>
  );
}
