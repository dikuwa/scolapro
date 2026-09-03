"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarClock, PencilLine, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Spinner } from "@/components/ui/spinner";
import { cancelTimetableSlot, updatePlannedAllocation } from "@/features/timetable/server/plan-actions";
import type { TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

const initialState: TimetableActionState = {};
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function localTodayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}

function useToastState(state: TimetableActionState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function TimetablePlanManagement({ workspace }: { workspace: TimetableWorkspace }) {
  const [updateState, updateAction, updatePending] = useActionState(updatePlannedAllocation, initialState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelTimetableSlot, initialState);
  useToastState(updateState);
  useToastState(cancelState);

  const today = localTodayIso();
  const upcomingAllocations = useMemo(() => workspace.allocations.filter((item) => item.activeFrom > today), [workspace.allocations, today]);
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [confirmCancelSlotId, setConfirmCancelSlotId] = useState<string | null>(null);
  const editingAllocation = upcomingAllocations.find((item) => item.id === editingAllocationId) ?? null;

  const startEditing = (allocation: TimetableWorkspace["allocations"][number]) => {
    setEditingAllocationId(allocation.id);
    setEditStart(allocation.activeFrom);
    setEditEnd(allocation.activeTo ?? "");
  };

  if (!upcomingAllocations.length && !workspace.plannedSlots.length) return null;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-2 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="scolapro-tone-amber grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarClock className="size-4" aria-hidden="true" /></span>
          <div><h2 className="scolapro-section-title">Plan corrections</h2><p className="scolapro-section-description !mt-0">Correct a handover before it starts, or cancel a future timetable slot without deleting its audit history.</p></div>
        </div>
        <span className="self-start rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1 text-[0.68rem] font-semibold text-muted-foreground">{upcomingAllocations.length} handover{upcomingAllocations.length === 1 ? "" : "s"} · {workspace.plannedSlots.length} planned slot{workspace.plannedSlots.length === 1 ? "" : "s"}</span>
      </div>

      {upcomingAllocations.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold">Upcoming teacher handovers</p>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {upcomingAllocations.map((item) => (
              <div key={item.id} className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate text-xs font-semibold">{item.subjectName} · {item.className}</p><p className="mt-1 truncate text-[0.68rem] text-muted-foreground">{item.staffName} · starts {formatIsoDate(item.activeFrom)}{item.activeTo ? ` · ends ${formatIsoDate(item.activeTo)}` : " · open ended"}</p></div>
                <button type="button" onClick={() => startEditing(item)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] bg-surface px-2.5 text-[0.68rem] font-semibold text-brand-strong shadow-[var(--shadow-xs)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"><PencilLine className="size-3.5" aria-hidden="true" />Edit dates</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {editingAllocation ? (
        <form action={updateAction} className="mt-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 sm:p-4">
          <input type="hidden" name="allocationId" value={editingAllocation.id} />
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">Correct handover dates</p><p className="mt-1 text-[0.68rem] text-muted-foreground">{editingAllocation.subjectName} · {editingAllocation.className} · {editingAllocation.staffName}</p></div><button type="button" onClick={() => setEditingAllocationId(null)} className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft" aria-label="Close handover editor"><X className="size-4" /></button></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DateField label="Starts on" name="activeFrom" value={editStart} onChange={(value) => { setEditStart(value); if (editEnd && value && editEnd < value) setEditEnd(""); }} min={today} required error={updateState.fieldErrors?.activeFrom?.[0]} />
            <DateField label="Ends on" name="activeTo" value={editEnd} onChange={setEditEnd} min={editStart || today} error={updateState.fieldErrors?.activeTo?.[0]} />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[0.66rem] leading-relaxed text-muted-foreground">Changes are allowed only before the existing handover starts. Existing planned slots are revalidated against timetable conflicts automatically.</p><button type="submit" disabled={updatePending} className="scolapro-cta inline-flex min-h-9 shrink-0 items-center justify-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{updatePending ? <Spinner className="size-3.5 text-white" /> : <PencilLine className="size-3.5" aria-hidden="true" />}{updatePending ? "Updating…" : "Update dates"}</button></div>
        </form>
      ) : null}

      {workspace.plannedSlots.length ? (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <p className="text-xs font-semibold">Pre-planned timetable slots</p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">These lessons belong to future teacher allocations and will enter the Current timetable when their allocation becomes effective.</p>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {workspace.plannedSlots.map((slot) => {
              const confirming = confirmCancelSlotId === slot.id;
              return (
                <div key={slot.id} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><p className="truncate text-xs font-semibold">{weekdays[slot.weekday - 1] ?? `Day ${slot.weekday}`} · {slot.periodName} · {slot.subjectName}</p><p className="mt-1 truncate text-[0.68rem] text-muted-foreground">{slot.className} · {slot.staffName} · from {formatIsoDate(slot.activeFrom)}{slot.roomLabel ? ` · ${slot.roomLabel}` : ""}</p></div>
                    {!confirming ? <button type="button" onClick={() => setConfirmCancelSlotId(slot.id)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem] font-semibold text-[color:var(--danger)] transition hover:bg-[color:var(--danger-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--danger-soft)]"><XCircle className="size-3.5" aria-hidden="true" />Cancel slot</button> : null}
                  </div>
                  {confirming ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-[var(--radius-xs)] bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><p className="text-[0.68rem] text-muted-foreground">Cancel this planned lesson? The slot will leave the active plan, but its record and audit trail are kept.</p><div className="flex gap-2"><button type="button" onClick={() => setConfirmCancelSlotId(null)} className="min-h-9 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem] font-semibold text-muted-foreground transition hover:bg-surface-muted">Keep slot</button><form action={cancelAction}><input type="hidden" name="slotId" value={slot.id} /><button type="submit" disabled={cancelPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-[color:var(--danger-soft)] px-2.5 text-[0.68rem] font-semibold text-[color:var(--danger)] transition hover:opacity-80 disabled:opacity-60">{cancelPending ? <Spinner className="size-3.5" /> : <XCircle className="size-3.5" aria-hidden="true" />}{cancelPending ? "Cancelling…" : "Confirm cancellation"}</button></form></div></div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
