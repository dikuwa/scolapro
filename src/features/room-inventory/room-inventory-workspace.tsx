"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";

import {
  assignCustodian,
  changeItem,
  createItem,
  verifyInventory,
  type RoomInventoryActionState,
} from "@/features/room-inventory/server/actions";
import type {
  RoomInventoryItem,
  RoomInventoryRoom,
  RoomInventoryStaff,
  RoomInventoryVerification,
} from "@/features/room-inventory/server/queries";
const init: RoomInventoryActionState = {};
const f =
  "mt-1 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm";
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
  useNotice(a);
  useNotice(c);
  useNotice(ch);
  useNotice(v);
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
              className={cn("mt-1.5", f)}
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
              <p className="mt-1 text-sm">
                Responsible: {room.custodianName || "Not assigned"}
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
                <Picker
                  label="Staff"
                  name="staffId"
                  value={staffId || room.custodianId || ""}
                  onChange={setStaffId}
                  searchable
                  placeholder="Choose staff"
                  options={staff.map((s) => ({ value: s.id, label: s.name }))}
                />
                <DateField
                  label="Effective from"
                  name="effectiveFrom"
                  value={effectiveFrom}
                  onChange={setEffectiveFrom}
                />
                <div className="mt-3 flex justify-start">
                  <Button
                    type="submit"
                    loading={p1}
                    disabled={p1 || !(staffId || room.custodianId)}
                  >
                    Assign custodian
                  </Button>
                </div>
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
              <input
                className={f}
                name="name"
                placeholder="Item description"
                required
              />
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
              <input
                className={f}
                name="quantity"
                type="number"
                min="0"
                defaultValue="1"
              />
              <Picker
                label="Condition"
                name="condition"
                value={itemCondition}
                onChange={setItemCondition}
                placeholder="Condition"
                options={conditions}
              />
              <input
                className={f}
                name="assetNumber"
                placeholder="Asset / GRN no. (optional)"
              />
              <input
                className={`${f} lg:col-span-2`}
                name="notes"
                placeholder="Notes / location"
              />
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
              {verifications
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
                ))}
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
      <div className="block text-xs font-medium">Quantity change</div>
      <input className={cn("mt-1.5", f)} name="delta" type="number" defaultValue="0" />
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
