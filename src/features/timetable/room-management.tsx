"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Building2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { removeRoom, saveRoom, type RoomActionState, type SchoolRoom } from "@/features/timetable/server/rooms";

const initialState: RoomActionState = {};
const inputClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition hover:border-border focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function RoomManagement({ schoolId, rooms }: { schoolId: string; rooms: SchoolRoom[] }) {
  const [state, action, pending] = useActionState(saveRoom, initialState);
  const [editing, setEditing] = useState<SchoolRoom | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [deletePending, startDelete] = useTransition();

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      queueMicrotask(() => { setOpen(false); setEditing(null); setStatus("active"); });
    } else toast.error(state.message);
  }, [state]);

  function edit(room: SchoolRoom) {
    setEditing(room);
    setStatus(room.status);
    setOpen(true);
  }

  return (
    <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2"><span className="scolapro-tone-sky grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Building2 className="size-4" /></span><div><h2 className="scolapro-section-title">Rooms & blocks</h2><p className="scolapro-section-description !mt-0">Optional timetable locations. Define rooms once, then reuse them when scheduling lessons.</p></div></div>
        <button type="button" onClick={() => { setEditing(null); setStatus("active"); setOpen(true); }} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong"><Plus className="size-3.5" />Add room</button>
      </div>

      {open ? <form action={action} className="mt-4 grid gap-3 rounded-[var(--radius-md)] bg-surface-muted/55 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="roomId" value={editing?.id ?? ""} />
        <div><label className="text-xs font-medium" htmlFor="room-code">Room code</label><input key={`${editing?.id ?? "new"}-code`} id="room-code" name="code" defaultValue={editing?.code ?? ""} placeholder="B12" className={`${inputClass} uppercase`} /></div>
        <div><label className="text-xs font-medium" htmlFor="room-name">Display name</label><input key={`${editing?.id ?? "new"}-name`} id="room-name" name="name" defaultValue={editing?.name ?? ""} placeholder="Science Lab 1" className={inputClass} /></div>
        <div><label className="text-xs font-medium" htmlFor="room-block">Block</label><input key={`${editing?.id ?? "new"}-block`} id="room-block" name="block" defaultValue={editing?.block ?? ""} placeholder="Block B · optional" className={inputClass} /></div>
        <div><label className="text-xs font-medium" htmlFor="room-capacity">Capacity</label><input key={`${editing?.id ?? "new"}-capacity`} id="room-capacity" name="capacity" type="number" min="1" defaultValue={editing?.capacity ?? ""} placeholder="Optional" className={inputClass} /></div>
        <Picker label="Status" name="status" value={status} onChange={(value) => setStatus(value as "active" | "inactive")} placeholder="Status" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end"><button type="button" onClick={() => { setOpen(false); setEditing(null); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted-foreground hover:bg-surface"><X className="size-3.5" />Cancel</button><button type="submit" disabled={pending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" />}{pending ? "Saving…" : "Save room"}</button></div>
      </form> : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => <article key={room.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="scolapro-record-title truncate">{room.name}</p><span className={`rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[0.62rem] font-medium ${room.status === "active" ? "bg-success-soft text-[color:var(--success)]" : "bg-surface text-muted-foreground"}`}>{room.status}</span></div><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{room.code}{room.block ? ` · ${room.block}` : ""}{room.capacity ? ` · ${room.capacity} seats` : ""}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => edit(room)} aria-label={`Edit ${room.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface hover:text-brand-strong"><Pencil className="size-3.5" /></button><button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const form = new FormData(); form.set("roomId", room.id); const result = await removeRoom(form); if (result?.success) toast.success(result.message); else if (result?.message) toast.error(result.message); })} aria-label={`Delete ${room.name}`} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-danger-soft hover:text-[color:var(--danger)] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div></article>)}
        {!rooms.length ? <div className="rounded-[var(--radius-sm)] border border-dashed border-border px-4 py-7 text-center text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">No rooms configured. Timetable slots can still be created without a room.</div> : null}
      </div>
    </section>
  );
}
