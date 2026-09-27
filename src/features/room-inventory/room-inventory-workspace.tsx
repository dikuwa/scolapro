"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Picker } from "@/components/ui/picker";
import { DateField } from "@/components/ui/date-field";
import { formFieldLabelClass, formFieldControlOffsetClass } from "@/components/ui/form-field-layout";

import {
  assignCustodian,
  changeItem,
  clearCustodian,
  createItem,
  verifyInventory,
  type RoomInventoryActionState,
} from "@/features/room-inventory/server/actions";
import { Boxes, ChevronDown, ChevronRight, DoorOpen, Search, ShieldCheck, TriangleAlert, Undo2, UserRound } from "lucide-react";
import type {
  RoomCustodianSource,
  RoomInventoryItem,
  RoomInventoryRoom,
  RoomInventoryStaff,
  RoomInventoryVerification,
} from "@/features/room-inventory/server/queries";
const init: RoomInventoryActionState = {};
// Raw labelled inputs share the scolapro-control-surface tokens and the shared
// control offset so they sit level with Picker/DateField/NumberStepper in a row.
const f =
  `scolapro-control-surface ${formFieldControlOffsetClass} min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm outline-none`;
// #702 provenance: the custodian of record is either an explicit manual override
// or a default inherited from the home-room register class. Colour never carries
// the meaning alone — every chip also states its source in text.
const custodianSourceLabel: Record<RoomCustodianSource, string> = {
  manual: "Manual override",
  inherited: "Home room default",
  ambiguous: "Shared home room",
  none: "No custodian",
};
const custodianSourceClass: Record<RoomCustodianSource, string> = {
  manual: "bg-brand-soft text-[color:var(--brand)]",
  inherited: "bg-[color:var(--accent-mint-soft)] text-[color:var(--accent-mint)]",
  ambiguous: "bg-warning-soft text-[color:var(--warning)]",
  none: "bg-surface-muted text-muted-foreground",
};
function CustodianSourceChip({ source }: { source: RoomCustodianSource }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.68rem] font-medium ${custodianSourceClass[source]}`}
    >
      {source === "ambiguous" ? (
        <TriangleAlert className="size-3" aria-hidden="true" />
      ) : (
        <UserRound className="size-3" aria-hidden="true" />
      )}
      {custodianSourceLabel[source]}
    </span>
  );
}
function custodianContextLine(room: RoomInventoryRoom): string {
  const classes = (room.homeRoomClasses ?? []).map((c) => c.name).join(", ");
  if (room.custodianSource === "manual") {
    return `Manual override${room.manualEffectiveFrom ? ` effective from ${room.manualEffectiveFrom}` : ""}.`;
  }
  if (room.custodianSource === "inherited") {
    return `Inherited default — register teacher of ${classes}.`;
  }
  if (room.custodianSource === "ambiguous") {
    return `${classes} are homed in this room and name different register teachers.`;
  }
  if (room.custodianReason === "home_room_teacher_unassigned") {
    return `${classes} has no register teacher, so no default custodian applies.`;
  }
  if (room.custodianReason === "home_room_teacher_not_current") {
    return `The register teacher for ${classes} is not currently assigned to this school.`;
  }
  return "No register class uses this room as its home room.";
}
function useNotice(s: RoomInventoryActionState) {
  useEffect(() => {
    if (s.message) {
      if (s.success) toast.success(s.message);
      else toast.error(s.message);
    }
  }, [s]);
}
export function RoomInventoryWorkspace({
  rooms,
  items,
  staff,
  verifications,
  today,
  canAssign,
  viewerStaffMemberIds,
}: {
  rooms: RoomInventoryRoom[];
  items: RoomInventoryItem[];
  staff: RoomInventoryStaff[];
  verifications: RoomInventoryVerification[];
  today: string;
  canAssign: boolean;
  viewerStaffMemberIds: string[];
}) {
  const viewerStaff = useMemo(() => new Set(viewerStaffMemberIds), [viewerStaffMemberIds]);
  const preferredRoomId =
    rooms.find((candidate) => candidate.custodianId && viewerStaff.has(candidate.custodianId))?.id ??
    rooms[0]?.id ??
    "";

  const [staffId, setStaffId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [verificationStatus, setVerificationStatus] = useState("confirmed");
  const [itemOwnership, setItemOwnership] = useState("government");
  const [itemCondition, setItemCondition] = useState("good");
  const [roomId, setRoomId] = useState(preferredRoomId);
  const [roomSearch, setRoomSearch] = useState("");
  const [ownership, setOwnership] = useState("");
  const [condition, setCondition] = useState("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [responsibilityOpen, setResponsibilityOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeRoomId = rooms.some((candidate) => candidate.id === roomId) ? roomId : preferredRoomId;
  const room = rooms.find((candidate) => candidate.id === activeRoomId);
  const selectedRoomIsMine = Boolean(room?.custodianId && viewerStaff.has(room.custodianId));
  const myRoomCount = rooms.filter((candidate) => candidate.custodianId && viewerStaff.has(candidate.custodianId)).length;
  const attentionConditions = new Set(["poor", "damaged", "lost"]);
  const roomAttentionCount = (id: string) =>
    items.filter((item) => item.roomId === id && attentionConditions.has(item.condition)).length;
  const attentionRoomCount = rooms.filter((candidate) => roomAttentionCount(candidate.id) > 0).length;
  const neverVerifiedCount = rooms.filter((candidate) => !candidate.lastVerified).length;
  const totalItemLines = rooms.reduce((sum, candidate) => sum + candidate.itemCount, 0);

  const filteredRooms = useMemo(() => {
    const needle = roomSearch.trim().toLowerCase();
    if (!needle) return rooms;
    return rooms.filter((candidate) =>
      [candidate.name, candidate.code, candidate.block, candidate.custodianName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [roomSearch, rooms]);

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (!activeRoomId || item.roomId === activeRoomId) &&
          (!ownership || item.ownership === ownership) &&
          (!condition || item.condition === condition) &&
          (!q ||
            item.name.toLowerCase().includes(q.toLowerCase()) ||
            (item.assetNumber ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [items, activeRoomId, ownership, condition, q],
  );

  const selectedRoomVerifications = useMemo(
    () => verifications.filter((entry) => entry.roomId === activeRoomId),
    [activeRoomId, verifications],
  );

  const createAndClose = async (previous: RoomInventoryActionState, data: FormData) => {
    const result = await createItem(previous, data);
    if (result.success) {
      setAddOpen(false);
      setItemOwnership("government");
      setItemCondition("good");
    }
    return result;
  };
  const changeAndClose = async (previous: RoomInventoryActionState, data: FormData) => {
    const result = await changeItem(previous, data);
    if (result.success) setEditingItemId(null);
    return result;
  };

  const [a, assign, p1] = useActionState(assignCustodian, init);
  const [c, create, p2] = useActionState(createAndClose, init);
  const [ch, change, p3] = useActionState(changeAndClose, init);
  const [v, verify, p4] = useActionState(verifyInventory, init);
  const safeClear = clearCustodian || (async () => ({}));
  const [cl, clear, p5] = useActionState(safeClear, init);
  useNotice(a);
  useNotice(c);
  useNotice(ch);
  useNotice(v);
  useNotice(cl);

  const selectRoom = (nextRoomId: string) => {
    setRoomId(nextRoomId);
    setStaffId("");
    setOwnership("");
    setCondition("");
    setQ("");
    setEditingItemId(null);
    setAddOpen(false);
    setResponsibilityOpen(false);
    setVerifyOpen(false);
    setHistoryOpen(false);
  };

  const clearFilters = () => {
    setOwnership("");
    setCondition("");
    setQ("");
  };

  if (!rooms.length) {
    return (
      <p className="rounded-[var(--radius-md)] bg-surface p-5 text-sm text-muted-foreground">
        No rooms are available for your current inventory scope.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div><p className="text-xs font-medium text-muted-foreground">Rooms in scope</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-indigo)]">{rooms.length}</p></div>
          <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><DoorOpen className="size-4" /></span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
          <div><p className="text-xs font-medium text-muted-foreground">{canAssign ? "Item lines" : "My rooms"}</p><p className="mt-1.5 text-2xl font-semibold">{canAssign ? totalItemLines : myRoomCount}</p></div>
          <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground">{canAssign ? <Boxes className="size-4" /> : <UserRound className="size-4" />}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-t-0 lg:border-l sm:px-5">
          <div><p className="text-xs font-medium text-muted-foreground">Needs attention</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--warning)]">{attentionRoomCount}</p></div>
          <span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><TriangleAlert className="size-4" /></span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 lg:border-l lg:border-t-0 sm:px-5">
          <div><p className="text-xs font-medium text-muted-foreground">Never verified</p><p className="mt-1.5 text-2xl font-semibold">{neverVerifiedCount}</p></div>
          <span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><ShieldCheck className="size-4" /></span>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="scolapro-section-title">{canAssign ? "Rooms" : "Your rooms"}</h2>
            <p className="scolapro-section-description">
              {canAssign ? "Scan responsibility, verification and inventory health before opening a room." : "Open a room to review the inventory you are responsible for."}
            </p>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search rooms</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={roomSearch}
              onChange={(event) => setRoomSearch(event.target.value)}
              placeholder="Search rooms"
              className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] pl-9 pr-3 text-sm outline-none"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRooms.map((candidate) => {
            const isMine = Boolean(candidate.custodianId && viewerStaff.has(candidate.custodianId));
            const attention = roomAttentionCount(candidate.id);
            const selected = candidate.id === activeRoomId;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => selectRoom(candidate.id)}
                className={`rounded-[var(--radius-md)] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 ${selected ? "border-brand/45 bg-brand-soft/35 shadow-[var(--shadow-xs)]" : "border-border-subtle bg-surface-elevated hover:bg-surface-muted/55"}`}
                aria-pressed={selected}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">{candidate.name}</h3>
                      {isMine ? <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.65rem] font-medium text-brand-strong">Your room</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{candidate.block || "No building/section"}</p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{candidate.itemCount} items</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{candidate.custodianName || "No custodian"}</span>
                  <CustodianSourceChip source={candidate.custodianSource} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs">
                  <span className={attention ? "font-medium text-[color:var(--warning)]" : "text-muted-foreground"}>
                    {attention ? `${attention} item${attention === 1 ? "" : "s"} need attention` : "No flagged items"}
                  </span>
                  <span className={candidate.lastVerified ? "text-muted-foreground" : "font-medium text-[color:var(--warning)]"}>
                    {candidate.lastVerified ? `Verified ${candidate.lastVerified}` : "Not verified"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {!filteredRooms.length ? <p className="mt-4 text-sm text-muted-foreground">No rooms match your search.</p> : null}
      </section>

      {room ? (
        <>
          <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{selectedRoomIsMine ? "Your room" : "Selected room"}</p>
                  {selectedRoomIsMine ? <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.65rem] font-medium text-brand-strong">Responsible custodian</span> : null}
                </div>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{room.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{room.block || "No building/section"} · {room.itemCount} item lines</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm">Responsible: {room.custodianName || "Not assigned"}</span>
                  <CustodianSourceChip source={room.custodianSource} />
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{custodianContextLine(room)}</p>
                <p className="mt-2 text-xs text-muted-foreground">Last verified: {room.lastVerified || "Never"}</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button type="button" onClick={() => setVerifyOpen((open) => !open)}>{verifyOpen ? "Close verification" : "Verify inventory"}</Button>
                {canAssign ? <Button type="button" variant="neutral" onClick={() => setResponsibilityOpen((open) => !open)}>{responsibilityOpen ? "Close responsibility" : "Manage responsibility"}</Button> : null}
                {room.lastVerified ? (
                  <>
                    <Button type="button" variant="neutral" size="sm" onClick={() => window.open(`/api/official-documents/room-inventory?room=${room.id}`, "_blank", "noopener,noreferrer")}>Preview sheet</Button>
                    <Button type="button" variant="neutral" size="sm" onClick={() => window.open(`/api/official-documents/room-inventory?room=${room.id}&print=1`, "_blank", "noopener,noreferrer")}>Print</Button>
                    <Button type="button" variant="neutral" size="sm" onClick={() => window.open(`/api/official-documents/room-inventory?room=${room.id}&format=pdf`, "_blank", "noopener,noreferrer")}>PDF</Button>
                  </>
                ) : null}
              </div>
            </div>

            {verifyOpen ? (
              <form action={verify} className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto] lg:items-end">
                <input type="hidden" name="roomId" value={room.id} />
                <Picker
                  label="Verification status"
                  name="status"
                  value={verificationStatus}
                  onChange={setVerificationStatus}
                  placeholder="Choose status"
                  options={[
                    { value: "confirmed", label: "No changes — confirm inventory" },
                    { value: "exceptions_noted", label: "Exceptions noted" },
                  ]}
                />
                <label className="min-w-0">
                  <span className={formFieldLabelClass}>Verification note</span>
                  <input className={f} name="notes" placeholder="Optional note" />
                </label>
                <Button type="submit" loading={p4} disabled={p4}>Confirm inventory</Button>
              </form>
            ) : null}

            {canAssign && responsibilityOpen ? (
              <form action={assign} className="mt-4 border-t border-border-subtle pt-4">
                <input type="hidden" name="roomId" value={room.id} />
                <div className="mb-3">
                  <h3 className="scolapro-section-title">Room responsibility</h3>
                  <p className="scolapro-section-description">Change the responsible custodian only when the inherited home-room default is not appropriate.</p>
                </div>
                {room.custodianSource === "ambiguous" ? (
                  <p role="status" className="mb-3 flex items-start gap-1.5 rounded-[var(--radius-xs)] bg-warning-soft/60 px-2.5 py-1.5 text-[0.68rem] leading-5 text-[color:var(--warning)]">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>{room.homeRoomClasses.length} register classes share this room and name different register teachers. Choose a custodian below — nothing is picked automatically.</span>
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
                  <Picker
                    label="Staff"
                    name="staffId"
                    value={staffId || room.custodianId || room.inheritedCustodianId || ""}
                    onChange={setStaffId}
                    searchable
                    placeholder="Choose staff"
                    options={staff.map((member) => ({ value: member.id, label: member.name }))}
                  />
                  <div>
                    <DateField label="Effective from" name="effectiveFrom" value={effectiveFrom} onChange={setEffectiveFrom} />
                    {!staffId && room.custodianSource === "inherited" && room.inheritedCustodianId ? (
                      <p className="mt-1 text-[0.68rem] text-muted-foreground">Prefilled from the home room default. Assigning records it as the explicit custodian.</p>
                    ) : null}
                  </div>
                  <Button type="submit" loading={p1} disabled={p1 || !(staffId || room.custodianId || room.inheritedCustodianId)}>
                    {room.custodianSource === "inherited" ? "Assign as custodian" : "Assign custodian"}
                  </Button>
                </div>
                {room.custodianSource === "manual" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="neutral"
                      size="sm"
                      loading={p5}
                      disabled={p5}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("roomId", room.id);
                        fd.set("effectiveOn", effectiveFrom);
                        clear(fd);
                      }}
                    >
                      <Undo2 className="size-3.5" aria-hidden="true" />Clear override
                    </Button>
                    <span className="text-[0.68rem] text-muted-foreground">Clearing the override restores the home room default and keeps this assignment in the custodian history.</span>
                  </div>
                ) : null}
              </form>
            ) : null}
          </section>

          <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="scolapro-section-title">Current inventory</h2>
                <p className="scolapro-section-description">{room.itemCount} item lines in {room.name}. Search or filter only when needed.</p>
              </div>
              <Button type="button" variant="neutral" onClick={() => setAddOpen((open) => !open)}>{addOpen ? "Close add form" : "+ Add inventory item"}</Button>
            </div>

            <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <Picker
                label="Ownership"
                value={ownership}
                onChange={setOwnership}
                placeholder="All"
                options={[
                  { value: "", label: "All" },
                  { value: "government", label: "GRN / Government" },
                  { value: "school", label: "School" },
                  { value: "personal", label: "Personal" },
                ]}
              />
              <Picker label="Condition" value={condition} onChange={setCondition} placeholder="All" options={[{ value: "", label: "All" }, ...conditions]} />
              <label className="sm:col-span-2">
                <span className={formFieldLabelClass}>Search item / asset no.</span>
                <input className={f} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search this room" />
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? "item" : "items"} shown</span>
              <Button type="button" variant="ghost" size="sm" disabled={!ownership && !condition && !q} onClick={clearFilters}>Clear filters</Button>
            </div>

            {addOpen ? (
              <form action={create} className="mt-4 border-t border-border-subtle pt-4">
                <input type="hidden" name="roomId" value={room.id} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="min-w-0"><span className={formFieldLabelClass}>Item description</span><input className={f} name="name" placeholder="Item description" required /></label>
                  <Picker
                    label="Ownership"
                    name="ownership"
                    value={itemOwnership}
                    onChange={setItemOwnership}
                    placeholder="Ownership"
                    options={[
                      { value: "government", label: "GRN / Government" },
                      { value: "school", label: "School-owned" },
                      { value: "personal", label: "Personal" },
                    ]}
                  />
                  <NumberStepper label="Quantity" name="quantity" min={0} defaultValue={1} />
                  <Picker label="Condition" name="condition" value={itemCondition} onChange={setItemCondition} placeholder="Condition" options={conditions} />
                  <label className="min-w-0"><span className={formFieldLabelClass}>Asset / GRN no.</span><input className={f} name="assetNumber" placeholder="Asset / GRN no. (optional)" /></label>
                  <label className="min-w-0 lg:col-span-2"><span className={formFieldLabelClass}>Notes / location</span><input className={f} name="notes" placeholder="Notes / location" /></label>
                </div>
                <div className="mt-3 flex justify-start gap-2 sm:justify-end">
                  <Button type="button" variant="neutral" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button type="submit" loading={p2} disabled={p2}>Add item</Button>
                </div>
              </form>
            ) : null}

            {visible.length ? (
              <div className="mt-4 max-h-[34rem] divide-y divide-border-subtle overflow-auto rounded-[var(--radius-sm)] border border-border-subtle">
                {visible.map((item) => (
                  <InventoryChangeForm
                    key={item.id}
                    item={item}
                    action={change}
                    pending={p3}
                    expanded={editingItemId === item.id}
                    onToggle={() => setEditingItemId((current) => current === item.id ? null : item.id)}
                  />
                ))}
              </div>
            ) : <p className="mt-4 text-sm text-muted-foreground">No inventory matches the current filters.</p>}
          </section>

          <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4">
            <button type="button" onClick={() => setHistoryOpen((open) => !open)} className="flex w-full items-center justify-between gap-4 text-left" aria-expanded={historyOpen}>
              <div><h2 className="scolapro-section-title">Verification history</h2><p className="scolapro-section-description">{selectedRoomVerifications.length} recorded verification{selectedRoomVerifications.length === 1 ? "" : "s"}.</p></div>
              {historyOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
            </button>
            {historyOpen ? (
              <div className="mt-3 space-y-2 border-t border-border-subtle pt-2">
                {selectedRoomVerifications.length ? selectedRoomVerifications.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex justify-between gap-3 border-t border-border-subtle py-2 text-sm first:border-t-0">
                    <span>{entry.verifiedOn} · {entry.status.replaceAll("_", " ")}</span>
                    <span className="text-muted-foreground">{entry.itemCount} items</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No verification history yet.</p>}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

const conditions = [
  "new",
  "good",
  "fair",
  "poor",
  "damaged",
  "lost",
  "disposed",
].map((value) => ({ value, label: value }));
function InventoryChangeForm({
  item: i,
  action,
  pending,
  expanded,
  onToggle,
}: {
  item: RoomInventoryItem;
  action: (data: FormData) => void;
  pending: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [eventType, setEventType] = useState("correction");
  const [condition, setCondition] = useState("");
  const [ownership, setOwnership] = useState("");
  return (
    <div className="bg-surface">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="scolapro-record-title truncate">{i.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {i.assetNumber || "No asset no."} · {i.ownership} · qty {i.quantity} · {i.condition}
          </p>
          {i.notes ? <p className="mt-1 truncate text-xs text-muted-foreground">{i.notes}</p> : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? "Close change" : "Record change"}
        </Button>
      </div>
      {expanded ? (
        <form action={action} className="grid gap-3 border-t border-border-subtle bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="itemId" value={i.id} />
          <Picker
            label="Change"
            name="eventType"
            value={eventType}
            onChange={setEventType}
            placeholder="Choose change"
            options={[
              { value: "quantity_increase", label: "Quantity increase" },
              { value: "quantity_decrease", label: "Quantity decrease" },
              { value: "damaged", label: "Damaged" },
              { value: "lost", label: "Lost" },
              { value: "disposed", label: "Disposed" },
              { value: "transferred_out", label: "Transferred out" },
              { value: "correction", label: "Correction" },
              { value: "ownership_correction", label: "Ownership correction" },
            ]}
          />
          <label className="min-w-0">
            <span className={formFieldLabelClass}>Quantity change</span>
            <input className={f} name="delta" type="number" defaultValue="0" />
          </label>
          <Picker
            label="Condition"
            name="condition"
            value={condition}
            onChange={setCondition}
            placeholder="Keep condition"
            options={[{ value: "", label: "Keep condition" }, ...conditions]}
          />
          <Picker
            label="Ownership"
            name="ownership"
            value={ownership}
            onChange={setOwnership}
            placeholder="Keep ownership"
            options={[
              { value: "", label: "Keep ownership" },
              { value: "government", label: "GRN" },
              { value: "school", label: "School" },
              { value: "personal", label: "Personal" },
            ]}
          />
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
            <Button type="button" variant="neutral" onClick={onToggle}>Cancel</Button>
            <Button type="submit" loading={pending}>Record change</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
