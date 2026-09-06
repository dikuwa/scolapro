"use client";

import { useActionState, useEffect, useState } from "react";
import { BadgeCheck, MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { configureStaffAssignment, type StaffConfigurationState } from "@/features/staff/server/actions";
import type { StaffDirectoryRow } from "@/features/staff/server/directory";
import type { SchoolRoom } from "@/features/timetable/server/rooms";

const initialState: StaffConfigurationState = {};

function humanRole(value: string) { return value.replaceAll("_", " "); }

function StaffRow({ row, rooms, canManage }: { row: StaffDirectoryRow; rooms: SchoolRoom[]; canManage: boolean }) {
  const [state, action, pending] = useActionState(configureStaffAssignment, initialState);
  const [roomId, setRoomId] = useState(row.defaultRoomId ?? "");
  useEffect(() => { if (!state.message) return; state.success ? toast.success(state.message) : toast.error(state.message); }, [state]);
  return <article className="grid gap-3 py-4 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,0.9fr)_minmax(12rem,0.55fr)_minmax(20rem,1fr)] xl:items-center">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="scolapro-record-title truncate">{row.name}</p>{row.staffCode ? <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.65rem] font-semibold text-brand-strong">{row.staffCode}</span> : null}</div><p className="mt-0.5 text-xs text-muted-foreground">{row.employeeNumber ? `Employee ${row.employeeNumber}` : "Employee number not set"} · {row.hasAccount ? "Account linked" : "No login account yet"}</p>{row.defaultRoomLabel ? <p className="mt-1 flex items-center gap-1 text-[0.68rem] text-muted-foreground"><MapPin className="size-3" />{row.defaultRoomLabel}</p> : null}</div>
    <div className="flex flex-wrap gap-1.5">{row.labels.map((label)=><span key={label} className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-[color:var(--accent-indigo-soft)] px-2.5 py-1.5 text-xs font-medium capitalize text-[color:var(--accent-indigo)]"><BadgeCheck className="size-3.5" aria-hidden="true" />{humanRole(label)}</span>)}</div>
    {canManage && row.assignmentId ? <form action={action} className="grid gap-2 sm:grid-cols-[7rem_minmax(11rem,1fr)_auto] sm:items-end"><input type="hidden" name="assignmentId" value={row.assignmentId}/><label className="text-xs font-medium">School code<input name="staffCode" defaultValue={row.staffCode ?? ""} maxLength={12} placeholder="e.g. MK" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm uppercase outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]"/></label><Picker label="Default teaching room" name="defaultRoomId" value={roomId} onChange={setRoomId} placeholder="No default room" options={[{ value: "", label: "No default room" },...rooms.filter((room)=>room.status==="active").map((room)=>({value:room.id,label:room.name,helper:room.code}))]}/><button disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60">{pending?<Spinner className="size-3.5 text-white"/>:<Save className="size-3.5"/>}{pending?"Saving…":"Save"}</button></form> : <p className="text-xs tabular-nums text-muted-foreground">From {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(row.activeFrom))}</p>}
  </article>;
}

export function StaffConfigurationList({ rows, rooms, canManage }: { rows: StaffDirectoryRow[]; rooms: SchoolRoom[]; canManage: boolean }) {
  return rows.length ? <div className="divide-y divide-border-subtle">{rows.map((row)=><StaffRow key={row.id} row={row} rooms={rooms} canManage={canManage}/>)}</div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No school staff linked yet</p><p className="mt-1 text-xs text-muted-foreground">Import staff or use Invitations to add the first school staff member.</p></div>;
}
