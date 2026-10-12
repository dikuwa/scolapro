"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { RecordActionButton } from "@/components/ui/record-action-button";
import { Spinner } from "@/components/ui/spinner";
import { assignRegisterTeacher, deleteGrade, deleteRegisterClass, updateGrade, updateRegisterClass, type AcademicStructureState } from "@/features/academics/server/actions";

const initialState: AcademicStructureState = {};
const fieldClass = "min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-2.5 text-xs outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

type Grade = { id: string; code: string; name: string };
type SchoolRoom = { id: string; code: string; name: string; block: string | null };
export type RegisterClass = { id: string; code: string; name: string; gradeId: string; registerTeacherStaffId: string | null; registerTeacherName: string | null; homeRoom: { id: string; code: string; name: string; block: string | null } | null };
type RegisterTeacherCandidate = { staffMemberId: string; staffName: string; employeeNumber: string | null };

function numericPart(value: string) { const match = value.match(/\d+/); return match ? Number(match[0]) : Number.NEGATIVE_INFINITY; }
function naturalCompare(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }

function gradeCode(code: string) { return /^\d+$/.test(code) ? `G${code}` : code.toUpperCase(); }

/**
 * Register-structure view for grades and register classes.
 *
 * `view` lets the combined Grade & Class card render only the slice belonging
 * to the active tab, so the register structure is never duplicated on screen
 * while grade-to-class relationships, editing and permissions stay intact.
 */
export function ClassManagement({ grades, classes, rooms, staff, canEditStructure = true, view = "grades" }: { grades: Grade[]; classes: RegisterClass[]; rooms: SchoolRoom[]; staff: RegisterTeacherCandidate[]; canEditStructure?: boolean; view?: "grades" | "classes" }) {
  const router = useRouter();
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [classState, classAction, classPending] = useActionState(updateRegisterClass, initialState);
  const [gradeState, gradeAction, gradePending] = useActionState(updateGrade, initialState);
  const [deletePending, startDelete] = useTransition();
  const [teacherPending, startTeacherUpdate] = useTransition();
  const [editingTeacherClassId, setEditingTeacherClassId] = useState<string | null>(null);
  const [registerTeacherStaffId, setRegisterTeacherStaffId] = useState("");
  const [classGradeId, setClassGradeId] = useState("");
  const [classHomeRoomId, setClassHomeRoomId] = useState("");

  const orderedGrades = useMemo(() => [...grades].sort((a, b) => {
    const numberDelta = numericPart(b.name || b.code) - numericPart(a.name || a.code);
    return numberDelta || naturalCompare(a.name, b.name);
  }), [grades]);
  const orderedClasses = useMemo(() => [...classes].sort((a, b) => naturalCompare(a.name || a.code, b.name || b.code)), [classes]);

  const classHomeRoomWarning = useMemo(() => {
    if (!classHomeRoomId) return null;
    const existing = classes.find((item) => item.id !== editingClassId && item.homeRoom?.id === classHomeRoomId);
    return existing
      ? `${existing.name} already uses this home room. Shared rooms are allowed — save to confirm, or choose another room.`
      : null;
  }, [classes, classHomeRoomId, editingClassId]);

  useEffect(() => {
    if (!classState.message) return;
    if (classState.success) {
      toast.success(classState.message);
      queueMicrotask(() => { setEditingClassId(null); setClassGradeId(""); setClassHomeRoomId(""); });
    } else toast.error(classState.message);
  }, [classState]);

  useEffect(() => {
    if (!gradeState.message) return;
    if (gradeState.success) { toast.success(gradeState.message); queueMicrotask(() => setEditingGradeId(null)); }
    else toast.error(gradeState.message);
  }, [gradeState]);

  function renderClassRow(item: RegisterClass) {
    if (editingClassId === item.id) {
      return (
        <form key={item.id} action={classAction} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[0.8fr_1fr_1fr_0.8fr_auto] sm:items-end">
          <input type="hidden" name="classId" value={item.id} />
          <Picker label="Grade" name="gradeId" value={classGradeId || item.gradeId} onChange={setClassGradeId} placeholder="Choose grade" options={orderedGrades.map((option) => ({ value: option.id, label: option.name }))} />
          <div><label className="text-xs font-medium" htmlFor={`code-${item.id}`}>Class code</label><input id={`code-${item.id}`} name="classCode" defaultValue={item.code.toUpperCase()} className={`${fieldClass} mt-1.5 uppercase`} /></div>
          <div><label className="text-xs font-medium" htmlFor={`name-${item.id}`}>Display name</label><input id={`name-${item.id}`} name="displayName" defaultValue={item.name} className={`${fieldClass} mt-1.5`} /></div>
          <div>
            <Picker label="Home room" name="homeRoomId" value={classHomeRoomId} onChange={setClassHomeRoomId} placeholder="Optional" searchable searchPlaceholder="Search rooms" options={rooms.map((room) => ({ value: room.id, label: room.name, helper: room.block ? `${room.block} · ${room.code}` : room.code }))} disabled={!rooms.length} />
            {classHomeRoomWarning ? <p role="status" className="mt-1.5 flex items-start gap-1.5 rounded-[var(--radius-xs)] bg-warning-soft/60 px-2.5 py-1.5 text-[0.68rem] leading-5 text-[color:var(--warning)]"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{classHomeRoomWarning}</span></p> : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={classPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-[0.7rem] font-semibold text-white disabled:opacity-60">{classPending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}Save</button>
            <button type="button" onClick={() => { setEditingClassId(null); setClassGradeId(""); setClassHomeRoomId(""); }} className="min-h-9 rounded-[var(--radius-sm)] px-2.5 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface">Cancel</button>
          </div>
        </form>
      );
    }

    if (editingTeacherClassId === item.id) {
      return (
        <div key={item.id} className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)_auto] sm:items-end">
          <div><p className="text-xs font-semibold">{item.name}</p><p className="mt-1 text-[0.68rem] text-muted-foreground">Assign the operational register teacher for attendance, class lists and register documents.</p></div>
          <Picker label="Register teacher" name={`register-teacher-${item.id}`} value={registerTeacherStaffId} onChange={setRegisterTeacherStaffId} placeholder="Unassigned" searchable searchPlaceholder="Search active staff" options={[{ value: "", label: "Unassigned" }, ...staff.map((candidate) => ({ value: candidate.staffMemberId, label: candidate.staffName, helper: candidate.employeeNumber ? `Employee ${candidate.employeeNumber}` : undefined }))]} />
          <div className="flex items-center gap-2">
            <button type="button" disabled={teacherPending} onClick={() => startTeacherUpdate(async () => { const formData = new FormData(); formData.set("classId", item.id); formData.set("staffMemberId", registerTeacherStaffId); const result = await assignRegisterTeacher(formData); if (result.success) { toast.success(result.message); setEditingTeacherClassId(null); router.refresh(); } else toast.error(result.message); })} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-[0.7rem] font-semibold text-white disabled:opacity-60">{teacherPending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}Save</button>
            <button type="button" onClick={() => setEditingTeacherClassId(null)} className="min-h-9 rounded-[var(--radius-sm)] px-2.5 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface">Cancel</button>
          </div>
        </div>
      );
    }

    return (
      <div key={item.id} className="flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">{item.name}</p>
          <p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.04em] text-muted-foreground">{item.code}</p>
          {item.homeRoom ? <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Room: {item.homeRoom.name}</p> : null}
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Register teacher: <span className={item.registerTeacherName ? "font-medium text-foreground" : "italic"}>{item.registerTeacherName ?? "Unassigned"}</span></p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => { setEditingTeacherClassId(item.id); setRegisterTeacherStaffId(item.registerTeacherStaffId ?? ""); }} className="min-h-8 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-medium text-brand-strong hover:bg-surface">{item.registerTeacherStaffId ? "Change teacher" : "Assign teacher"}</button>
          {canEditStructure ? (
            <>
              <RecordActionButton icon={Pencil} label={`Edit ${item.name}`} iconOnly onClick={() => { setEditingClassId(item.id); setClassGradeId(item.gradeId); setClassHomeRoomId(item.homeRoom ? item.homeRoom.id : ""); }} />
              <button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const formData = new FormData(); formData.set("classId", item.id); const result = await deleteRegisterClass(formData); if (result.success) toast.success(result.message); else toast.error(result.message); })} aria-label={`Delete ${item.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (!orderedGrades.length) {
    return <div className="mt-4 py-8 text-center text-sm text-muted-foreground">Add the first grade to begin academic setup.</div>;
  }

  if (view === "classes") {
    return (
      <div className="mt-4 space-y-5">
        {orderedGrades.map((grade) => {
          const gradeClasses = orderedClasses.filter((item) => item.gradeId === grade.id);
          return (
            <section key={grade.id}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="scolapro-record-title">{grade.name}</h4>
                <span className="text-[0.68rem] text-muted-foreground">{gradeCode(grade.code)}</span>
              </div>
              <div className="mt-2 space-y-2 border-l border-border-subtle pl-3">
                {gradeClasses.length ? gradeClasses.map((item) => renderClassRow(item)) : <p className="py-2 text-xs text-muted-foreground">No register classes yet.</p>}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-4 divide-y divide-border-subtle">
      {orderedGrades.map((grade) => {
        const gradeClasses = orderedClasses.filter((item) => item.gradeId === grade.id);
        const editingGrade = editingGradeId === grade.id;

        return (
          <div key={grade.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-h-12 items-center gap-2 rounded-[var(--radius-sm)] px-1 transition hover:bg-surface-muted/55">
              {editingGrade ? (
                <form action={gradeAction} className="grid min-w-0 flex-1 gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[9rem_1fr_auto] sm:items-end">
                  <input type="hidden" name="gradeId" value={grade.id} />
                  <div><label className="text-xs font-medium" htmlFor={`grade-code-${grade.id}`}>Grade code</label><input id={`grade-code-${grade.id}`} name="gradeCode" defaultValue={gradeCode(grade.code)} className={`${fieldClass} mt-1 uppercase`} /></div>
                  <div><label className="text-xs font-medium" htmlFor={`grade-name-${grade.id}`}>Display name</label><input id={`grade-name-${grade.id}`} name="displayName" defaultValue={grade.name} className={`${fieldClass} mt-1`} /></div>
                  <div className="flex items-center gap-2"><button type="submit" disabled={gradePending} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand px-2.5 text-[0.7rem] font-semibold text-white disabled:opacity-60">{gradePending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}Save</button><button type="button" onClick={() => setEditingGradeId(null)} className="min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface">Cancel</button></div>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <span className="scolapro-record-title block truncate">{grade.name}</span>
                    <span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{gradeCode(grade.code)} · {gradeClasses.length} register class{gradeClasses.length === 1 ? "" : "es"}</span>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {canEditStructure ? (
                      <>
                        <RecordActionButton icon={Pencil} label={`Edit ${grade.name}`} iconOnly onClick={() => setEditingGradeId(grade.id)} />
                        <button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const formData = new FormData(); formData.set("gradeId", grade.id); const result = await deleteGrade(formData); if (result.success) toast.success(result.message); else toast.error(result.message); })} aria-label={`Delete ${grade.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
