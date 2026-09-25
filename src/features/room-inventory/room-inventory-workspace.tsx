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
import { TriangleAlert, Undo2, UserRound } from "lucide-react";
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
}: {
  rooms: RoomInventoryRoom[];
  items: RoomInventoryItem[];
  staff: RoomInventoryStaff[];
  verifications: RoomInventoryVerification[];
  today: string;
  canAssign: boolean;
}) {
  const [staffId, setStaffId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [verificationStatus, setVerificationStatus] = useState("confirmed");
  const [itemOwnership, setItemOwnership] = useState("government");
  const [itemCondition, setItemCondition] = useState("good");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [ownership, setOwnership] = useState("");
  const [condition, setCondition] = useState("");
  const [q, setQ] = useState("");
  const room = rooms.find((r) => r.id === roomId);
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (!roomId || i.roomId === roomId) &&
          (!ownership || i.ownership === ownership) &&
          (!condition || i.condition === condition) &&
          (!q ||
            i.name.toLowerCase().includes(q.toLowerCase()) ||
            (i.assetNumber ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [items, roomId, ownership, condition, q],
  );
  const [a, assign, p1] = useActionState(assignCustodian, init);
  const [c, create, p2] = useActionState(createItem, init);
  const [ch, change, p3] = useActionState(changeItem, init);
  const [v, verify, p4] = useActionState(verifyInventory, init);
  const safeClear = clearCustodian || (async () => ({}));
  const [cl, clear, p5] = useActionState(safeClear, init);
  useNotice(a);
  useNotice(c);
  useNotice(ch);
  useNotice(v);
  useNotice(cl);
  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Picker
            label="Room"
            value={roomId}
            onChange={(value) => {
              setRoomId(value);
              setStaffId("");
            }}
            searchable
            placeholder="Choose room"
            options={rooms.map((r) => ({
              value: r.id,
              label: `${r.block ? `${r.block} · ` : ""}${r.code} · ${r.name}`,
            }))}
          />
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
          <Picker
            label="Condition"
            value={condition}
            onChange={setCondition}
            placeholder="All"
            options={[{ value: "", label: "All" }, ...conditions]}
          />
          <label className="lg:col-span-2">
            <span className={formFieldLabelClass}>
              Search item / asset no.
            </span>
            <input
              className={f}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search inventory"
            />
          </label>
        </div>
      </section>
      {room ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4">
              <p className="text-xs text-muted-foreground">Selected room</p>
              <h2 className="mt-1 font-semibold">
                {room.code} · {room.name}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {room.block || "No building/section"} · {room.itemCount} item
                lines
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  Responsible: {room.custodianName || "Not assigned"}
                </span>
                <CustodianSourceChip source={room.custodianSource} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {custodianContextLine(room)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last verified: {room.lastVerified || "Never"}
              </p>
            </section>
            {canAssign ? (
              <form
                action={assign}
                className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4"
              >
                <input type="hidden" name="roomId" value={room.id} />
                <h3 className="scolapro-section-title">Responsible staff</h3>

                {room.custodianSource === "ambiguous" ? (
                  <p
                    role="status"
                    className="mb-3 flex items-start gap-1.5 rounded-[var(--radius-xs)] bg-warning-soft/60 px-2.5 py-1.5 text-[0.68rem] leading-5 text-[color:var(--warning)]"
                  >
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {room.homeRoomClasses.length} register classes share this room and name
                      different register teachers. Choose a custodian below — nothing is
                      picked automatically.
                    </span>
                  </p>
                ) : null}

                <Picker
                  label="Staff"
                  name="staffId"
                  value={staffId || room.custodianId || room.inheritedCustodianId || ""}
                  onChange={setStaffId}
                  searchable
                  placeholder="Choose staff"
                  options={staff.map((s) => ({ value: s.id, label: s.name }))}
                />
                {!staffId && room.custodianSource === "inherited" && room.inheritedCustodianId ? (
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">
                    Prefilled from the home room default. Assigning records it as the
                    explicit custodian.
                  </p>
                ) : null}
                <DateField
                  label="Effective from"
                  name="effectiveFrom"
                  value={effectiveFrom}
                  onChange={setEffectiveFrom}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="submit"
                    loading={p1}
                    disabled={
                      p1 ||
                      !(staffId || room.custodianId || room.inheritedCustodianId)
                    }
                  >
                    {room.custodianSource === "inherited"
                      ? "Assign as custodian"
                      : "Assign custodian"}
                  </Button>
                  {room.custodianSource === "manual" ? (
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
                      <Undo2 className="size-3.5" aria-hidden="true" />
                      Clear override
                    </Button>
                  ) : null}
                </div>
                {room.custodianSource === "manual" ? (
                  <p className="mt-2 text-[0.68rem] text-muted-foreground">
                    Clearing the override restores the home room default and keeps this
                    assignment in the custodian history.
                  </p>
                ) : null}
              </form>
            ) : null}
            <form
              action={verify}
              className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4"
            >
              <input type="hidden" name="roomId" value={room.id} />
              <h3 className="scolapro-section-title">Verify inventory</h3>
              <Picker
                label="Verification status"
                name="status"
                value={verificationStatus}
                onChange={setVerificationStatus}
                placeholder="Choose status"
                options={[
                  {
                    value: "confirmed",
                    label: "No changes — confirm inventory",
                  },
                  { value: "exceptions_noted", label: "Exceptions noted" },
                ]}
              />
              <input
                className={f}
                name="notes"
                placeholder="Optional verification note"
              />
              <div className="mt-3 flex justify-start">
                <Button type="submit" loading={p4} disabled={p4}>
                  Confirm inventory
                </Button>
              </div>
            </form>
          </div>
          <form
            action={create}
            className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 sm:p-5"
          >
            <input type="hidden" name="roomId" value={room.id} />
            <h2 className="scolapro-section-title">Add inventory item</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="min-w-0">
                <span className={formFieldLabelClass}>Item description</span>
                <input
                  className={f}
                  name="name"
                  placeholder="Item description"
                  required
                />
              </label>
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
              <NumberStepper
                label="Quantity"
                name="quantity"
                min={0}
                defaultValue={1}
              />
              <Picker
                label="Condition"
                name="condition"
                value={itemCondition}
                onChange={setItemCondition}
                placeholder="Condition"
                options={conditions}
              />
              <label className="min-w-0">
                <span className={formFieldLabelClass}>Asset / GRN no.</span>
                <input
                  className={f}
                  name="assetNumber"
                  placeholder="Asset / GRN no. (optional)"
                />
              </label>
              <label className="min-w-0 lg:col-span-2">
                <span className={formFieldLabelClass}>Notes / location</span>
                <input
                  className={f}
                  name="notes"
                  placeholder="Notes / location"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-start sm:justify-end">
              <Button type="submit" loading={p2} disabled={p2}>
                Add item
              </Button>
            </div>
          </form>
          <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 sm:p-5">
            <h2 className="scolapro-section-title">Current inventory</h2>
            {visible.length ? (
              <div className="mt-3 space-y-3">
                {visible.map((i) => (
                  <InventoryChangeForm
                    key={i.id}
                    item={i}
                    action={change}
                    pending={p3}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No inventory matches the current filters.
              </p>
            )}
          </section>
          <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4">
            <h2 className="scolapro-section-title">Verification history</h2>
            <div className="mt-2 space-y-2">
              {verifications.filter((x) => x.roomId === room.id).length ? verifications
                .filter((x) => x.roomId === room.id)
                .slice(0, 8)
                .map((x) => (
                  <div
                    key={x.id}
                    className="flex justify-between gap-3 border-t border-border-subtle py-2 text-sm"
                  >
                    <span>
                      {x.verifiedOn} · {x.status.replaceAll("_", " ")}
                    </span>
                    <span className="text-muted-foreground">
                      {x.itemCount} items
                    </span>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No verification history yet.</p>
                )}
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-[var(--radius-md)] bg-surface p-5 text-sm text-muted-foreground">
          No rooms are available for your current inventory scope.
        </p>
      )}
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
}: {
  item: RoomInventoryItem;
  action: (data: FormData) => void;
  pending: boolean;
}) {
  const [eventType, setEventType] = useState("correction");
  const [condition, setCondition] = useState("");
  const [ownership, setOwnership] = useState("");
  return (
    <form
      action={action}
      className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <input type="hidden" name="itemId" value={i.id} />
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="scolapro-record-title">{i.name}</p>
        <p className="text-xs text-muted-foreground">
          {i.assetNumber || "No asset no."} · {i.ownership} · qty {i.quantity} ·{" "}
          {i.condition}
        </p>
      </div>
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
      <div className="flex items-end">
        <Button type="submit" loading={pending}>
          Record
        </Button>
      </div>
    </form>
  );
}
