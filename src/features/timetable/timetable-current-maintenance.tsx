"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { DoorOpen, PencilLine, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { cancelTimetableSlot, updateTimetableSlotRoom } from "@/features/timetable/server/plan-actions";
import type { TimetableActionState } from "@/features/timetable/server/actions";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

const initialState: TimetableActionState = {};
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function useToastState(state: TimetableActionState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function TimetableCurrentMaintenance({ workspace }: { workspace: TimetableWorkspace }) {
  const [roomState, roomAction, roomPending] = useActionState(updateTimetableSlotRoom, initialState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelTimetableSlot, initialState);
  useToastState(roomState);
  useToastState(cancelState);

  const [slotId, setSlotId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const selectedSlot = useMemo(() => workspace.slots.find((slot) => slot.id === slotId) ?? null, [slotId, workspace.slots]);

  const selectSlot = (value: string) => {
    setSlotId(value);
    const slot = workspace.slots.find((item) => item.id === value);
    setRoomId(slot?.roomId ?? "");
    setConfirmCancel(false);
  };

  const slotOptions = workspace.slots.map((slot) => ({
    value: slot.id,
    label: `${weekdays[slot.weekday - 1] ?? `Day ${slot.weekday}`} · ${slot.periodName} · ${slot.className}`,
    helper: `${slot.subjectName} · ${slot.staffName}`,
  }));
  const roomOptions = [
    { value: "", label: "No room", helper: "Remove the room assignment" },
    ...workspace.rooms.map((room) => ({
      value: room.id,
      label: room.name,
      helper: [room.code, room.block, room.capacity ? `${room.capacity} seats` : null].filter(Boolean).join(" · ") || undefined,
    })),
  ];

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="scolapro-tone-sky grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><PencilLine className="size-4" aria-hidden="true" /></span>
          <div><h2 className="scolapro-section-title">Current schedule maintenance</h2><p className="scolapro-section-description !mt-0 max-w-2xl">Correct a live lesson room or cancel an incorrect recurring slot. Cancellations preserve the timetable record and linked history.</p></div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-[0.66rem] font-medium text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden="true" />Governed changes</span>
      </div>

      {workspace.slots.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <Picker label="Current timetable slot" name="currentSlotPicker" value={slotId} onChange={selectSlot} placeholder="Choose a live lesson" options={slotOptions} />
            {selectedSlot ? (
              <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{selectedSlot.subjectName} · {selectedSlot.className}</p><span className="text-[0.64rem] font-medium text-[color:var(--accent-sky)]">{weekdays[selectedSlot.weekday - 1] ?? `Day ${selectedSlot.weekday}`} · {selectedSlot.periodName}</span></div>
                <p className="mt-1 text-[0.68rem] text-muted-foreground">{selectedSlot.staffName}{selectedSlot.staffCode ? ` · ${selectedSlot.staffCode}` : ""}</p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[0.68rem] text-muted-foreground"><DoorOpen className="size-3.5" aria-hidden="true" />{selectedSlot.roomLabel ?? "No room assigned"}</p>
              </div>
            ) : <p className="mt-3 text-xs leading-5 text-muted-foreground">Select a live lesson before changing its room or cancelling the slot.</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <form action={roomAction} className="rounded-[var(--radius-sm)] border border-border-subtle p-3">
              <input type="hidden" name="slotId" value={slotId} />
              <Picker label="Room assignment" name="roomId" value={roomId} onChange={setRoomId} placeholder="Choose room" options={roomOptions} disabled={!selectedSlot || roomPending} />
              <p className="mt-2 text-[0.66rem] leading-relaxed text-muted-foreground">Room conflicts are checked against overlapping timetable allocation periods before the change is saved.</p>
              <button type="submit" disabled={!selectedSlot || roomPending} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-xs)] bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50">{roomPending ? <Spinner className="size-3.5 text-white" /> : <DoorOpen className="size-3.5" aria-hidden="true" />}{roomPending ? "Saving…" : roomId ? "Update room" : "Remove room"}</button>
            </form>

            <div className="rounded-[var(--radius-sm)] border border-border-subtle p-3">
              <p className="text-xs font-semibold">Cancel recurring slot</p>
              <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">Use this only when the live timetable entry itself is wrong. The slot is marked cancelled rather than deleted, so historical references remain intact.</p>
              {!confirmCancel ? (
                <button type="button" disabled={!selectedSlot} onClick={() => setConfirmCancel(true)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-xs)] border border-[color:var(--danger)]/25 bg-[color:var(--danger-soft)] px-3 text-xs font-semibold text-[color:var(--danger)] transition hover:border-[color:var(--danger)]/40 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-3.5" aria-hidden="true" />Cancel slot</button>
              ) : (
                <div className="mt-3 rounded-[var(--radius-xs)] bg-[color:var(--danger-soft)] p-2.5">
                  <p className="text-[0.68rem] font-medium text-[color:var(--danger)]">Remove this lesson from the active recurring timetable?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={cancelAction}>
                      <input type="hidden" name="slotId" value={slotId} />
                      <button type="submit" disabled={!selectedSlot || cancelPending} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-[color:var(--danger)] px-2.5 text-[0.68rem] font-semibold text-white transition disabled:opacity-50">{cancelPending ? <Spinner className="size-3.5 text-white" /> : <Trash2 className="size-3.5" aria-hidden="true" />}{cancelPending ? "Cancelling…" : "Yes, cancel slot"}</button>
                    </form>
                    <button type="button" disabled={cancelPending} onClick={() => setConfirmCancel(false)} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] border border-border-subtle bg-surface px-2.5 text-[0.68rem] font-semibold transition hover:bg-surface-muted disabled:opacity-50"><X className="size-3.5" aria-hidden="true" />Keep slot</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-7 text-center"><p className="text-sm font-medium">No current slots to maintain</p><p className="mt-1 text-xs text-muted-foreground">Live timetable lessons will appear here once a current-effective allocation has scheduled slots.</p></div>
      )}
    </section>
  );
}
