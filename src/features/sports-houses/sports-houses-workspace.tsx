"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import {
  assignLearnerSportsHouse,
  assignStaffSportsHouse,
  changeSportsHouseStatus,
  saveSportsAgeGroup,
  saveSportsHouse,
  type SportsHousesActionState,
} from "@/features/sports-houses/server/actions";
import type {
  SportsAgeGroup,
  SportsHouse,
  SportsLearner,
  SportsStaff,
  SportsYearSettings,
} from "@/features/sports-houses/server/queries";

const initialState: SportsHousesActionState = {};
const fieldClass =
  "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-fast)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-55";

function useActionToast(state: SportsHousesActionState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function Swatch({ color }: { color: string | null }) {
  return (
    <span
      aria-label={color ? `Stored colour ${color}` : "No stored colour"}
      className="inline-block size-4 shrink-0 rounded-[var(--radius-xs)] border border-border-subtle bg-surface-muted"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function YearPicker({ academicYear, years }: { academicYear: number; years: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <Picker
      label="Academic year"
      value={String(academicYear)}
      onChange={(next) => {
        const params = new URLSearchParams(search.toString());
        params.set("year", next);
        router.push(`${pathname}?${params.toString()}`);
      }}
      placeholder="Choose year"
      options={years.map((year) => ({ value: String(year), label: String(year) }))}
      className="w-full sm:w-48"
    />
  );
}

function HouseForm({ schoolId, house, canManage }: { schoolId: string; house?: SportsHouse; canManage: boolean }) {
  const [saveState, saveAction, saving] = useActionState(saveSportsHouse, initialState);
  const [statusState, statusAction, changingStatus] = useActionState(changeSportsHouseStatus, initialState);
  useActionToast(saveState);
  useActionToast(statusState);

  if (!canManage && !house) return null;

  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-muted/45 p-3 sm:p-4">
      <form action={saveAction} className="grid gap-3 lg:grid-cols-[minmax(11rem,1.3fr)_minmax(8rem,.7fr)_minmax(10rem,.8fr)_7rem_auto] lg:items-end">
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="houseId" value={house?.id ?? ""} />
        <div>
          <label className="text-xs font-medium" htmlFor={`house-name-${house?.id ?? "new"}`}>Name</label>
          <input id={`house-name-${house?.id ?? "new"}`} name="name" defaultValue={house?.name ?? ""} disabled={!canManage} className={`${fieldClass} mt-1.5`} placeholder="House name" />
        </div>
        <div>
          <label className="text-xs font-medium" htmlFor={`house-code-${house?.id ?? "new"}`}>Short code</label>
          <input id={`house-code-${house?.id ?? "new"}`} name="shortCode" defaultValue={house?.shortCode ?? ""} disabled={!canManage} className={`${fieldClass} mt-1.5 uppercase`} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium" htmlFor={`house-color-${house?.id ?? "new"}`}>Stored colour</label>
          <div className="mt-1.5 flex items-center gap-2">
            <Swatch color={house?.colorHex ?? null} />
            <input id={`house-color-${house?.id ?? "new"}`} name="colorHex" defaultValue={house?.colorHex ?? ""} disabled={!canManage} className={fieldClass} placeholder="#RRGGBB" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium" htmlFor={`house-order-${house?.id ?? "new"}`}>Order</label>
          <input id={`house-order-${house?.id ?? "new"}`} type="number" name="sortOrder" defaultValue={house?.sortOrder ?? 0} disabled={!canManage} className={`${fieldClass} mt-1.5`} />
        </div>
        {canManage ? <Button type="submit" loading={saving} size="sm">{house ? "Save" : "Add house"}</Button> : null}
      </form>

      {house ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{house.status}</span>
            <span>Created {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(house.createdAt))}</span>
          </div>
          {canManage ? (
            <form action={statusAction}>
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="houseId" value={house.id} />
              <input type="hidden" name="status" value={house.status === "active" ? "inactive" : "active"} />
              <Button type="submit" variant="neutral" size="sm" loading={changingStatus}>
                {house.status === "active" ? "Deactivate" : "Activate"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AgeGroupForm({ schoolId, group, canManage }: { schoolId: string; group?: SportsAgeGroup; canManage: boolean }) {
  const [state, action, pending] = useActionState(saveSportsAgeGroup, initialState);
  useActionToast(state);
  if (!canManage && !group) return null;
  return (
    <form action={action} className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted/45 p-3 sm:p-4 lg:grid-cols-[minmax(11rem,1fr)_7rem_7rem_7rem_auto] lg:items-end">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="groupId" value={group?.id ?? ""} />
      <div>
        <label className="text-xs font-medium" htmlFor={`group-label-${group?.id ?? "new"}`}>Label</label>
        <input id={`group-label-${group?.id ?? "new"}`} name="label" defaultValue={group?.label ?? ""} disabled={!canManage} className={`${fieldClass} mt-1.5`} placeholder="School-defined label" />
      </div>
      <div>
        <label className="text-xs font-medium" htmlFor={`group-min-${group?.id ?? "new"}`}>Min age</label>
        <input id={`group-min-${group?.id ?? "new"}`} type="number" min="3" max="30" name="minAge" defaultValue={group?.minAge ?? ""} disabled={!canManage} className={`${fieldClass} mt-1.5`} />
      </div>
      <div>
        <label className="text-xs font-medium" htmlFor={`group-max-${group?.id ?? "new"}`}>Max age</label>
        <input id={`group-max-${group?.id ?? "new"}`} type="number" min="3" max="30" name="maxAge" defaultValue={group?.maxAge ?? ""} disabled={!canManage} className={`${fieldClass} mt-1.5`} />
      </div>
      <div>
        <label className="text-xs font-medium" htmlFor={`group-order-${group?.id ?? "new"}`}>Order</label>
        <input id={`group-order-${group?.id ?? "new"}`} type="number" name="sortOrder" defaultValue={group?.sortOrder ?? 0} disabled={!canManage} className={`${fieldClass} mt-1.5`} />
      </div>
      {canManage ? <Button type="submit" loading={pending} size="sm">{group ? "Save" : "Add group"}</Button> : null}
    </form>
  );
}

function LearnerAssignmentForm({
  schoolId,
  academicYear,
  learners,
  houses,
}: {
  schoolId: string;
  academicYear: number;
  learners: SportsLearner[];
  houses: SportsHouse[];
}) {
  const [state, action, pending] = useActionState(assignLearnerSportsHouse, initialState);
  const [learnerId, setLearnerId] = useState("");
  const [houseId, setHouseId] = useState("");
  const [locked, setLocked] = useState("false");
  useActionToast(state);
  const learnerOptions = learners.map((item) => ({
    value: item.id,
    label: item.name,
    helper: [item.admissionNumber, item.houseName ? `Current: ${item.houseName}` : "Unassigned"].filter(Boolean).join(" · "),
  }));
  const houseOptions = houses.filter((house) => house.status === "active").map((house) => ({ value: house.id, label: house.name, helper: house.shortCode ?? undefined }));

  return (
    <form action={action} className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted/45 p-3 sm:p-4 lg:grid-cols-[minmax(12rem,1.4fr)_minmax(10rem,1fr)_9rem_auto] lg:items-end">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="academicYear" value={academicYear} />
      <Picker label="Learner" name="learnerId" value={learnerId} onChange={setLearnerId} placeholder="Choose learner" options={learnerOptions} searchable />
      <Picker label="House" name="houseId" value={houseId} onChange={setHouseId} placeholder="Choose active house" options={houseOptions} />
      <Picker label="Lock assignment" name="isLocked" value={locked} onChange={setLocked} placeholder="Choose" options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]} />
      <Button type="submit" loading={pending} size="sm" disabled={!learnerId || !houseId}>Save assignment</Button>
    </form>
  );
}

function StaffAssignmentForm({
  schoolId,
  academicYear,
  staff,
  houses,
}: {
  schoolId: string;
  academicYear: number;
  staff: SportsStaff[];
  houses: SportsHouse[];
}) {
  const [state, action, pending] = useActionState(assignStaffSportsHouse, initialState);
  const [staffId, setStaffId] = useState("");
  const [houseId, setHouseId] = useState("");
  const [roleKey, setRoleKey] = useState("member");
  const [locked, setLocked] = useState("false");
  useActionToast(state);
  const staffOptions = staff.map((item) => ({
    value: item.id,
    label: item.name,
    helper: [item.employeeNumber, item.houseName ? `Current: ${item.houseName}` : "Unassigned"].filter(Boolean).join(" · "),
  }));
  const houseOptions = houses.filter((house) => house.status === "active").map((house) => ({ value: house.id, label: house.name, helper: house.shortCode ?? undefined }));

  return (
    <form action={action} className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted/45 p-3 sm:p-4 xl:grid-cols-[minmax(12rem,1.35fr)_minmax(10rem,1fr)_9rem_9rem_auto] xl:items-end">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="academicYear" value={academicYear} />
      <Picker label="Staff member" name="staffId" value={staffId} onChange={setStaffId} placeholder="Choose staff" options={staffOptions} searchable />
      <Picker label="House" name="houseId" value={houseId} onChange={setHouseId} placeholder="Choose active house" options={houseOptions} />
      <Picker label="House role" name="roleKey" value={roleKey} onChange={setRoleKey} placeholder="Choose role" options={[{ value: "member", label: "Member" }, { value: "leader", label: "House leader" }]} />
      <Picker label="Lock assignment" name="isLocked" value={locked} onChange={setLocked} placeholder="Choose" options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]} />
      <Button type="submit" loading={pending} size="sm" disabled={!staffId || !houseId}>Save assignment</Button>
    </form>
  );
}

function AssignmentMeta({ source, locked, assignedAt }: { source: string | null; locked: boolean; assignedAt: string | null }) {
  if (!source && !assignedAt) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-muted-foreground">
      <span className="capitalize">Source: {source ?? "unknown"}</span>
      {locked ? <span className="inline-flex items-center gap-1"><LockKeyhole className="size-3" aria-hidden="true" />Locked</span> : <span>Unlocked</span>}
      {assignedAt ? <span>{new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(assignedAt))}</span> : null}
    </div>
  );
}

export function SportsHousesWorkspace({
  schoolId,
  schoolName,
  academicYear,
  years,
  houses,
  ageGroups,
  learners,
  staff,
  yearSettings,
  learnerAssignedCount,
  learnerUnassignedCount,
  staffAssignedCount,
  staffUnassignedCount,
  canManage,
}: {
  schoolId: string;
  schoolName: string;
  academicYear: number;
  years: number[];
  houses: SportsHouse[];
  ageGroups: SportsAgeGroup[];
  learners: SportsLearner[];
  staff: SportsStaff[];
  yearSettings: SportsYearSettings | null;
  learnerAssignedCount: number;
  learnerUnassignedCount: number;
  staffAssignedCount: number;
  staffUnassignedCount: number;
  canManage: boolean;
}) {
  const activeHouses = useMemo(() => houses.filter((house) => house.status === "active"), [houses]);
  const leaders = staff.filter((item) => item.roleKey === "leader");

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="scolapro-section-title">Year context</h2>
          <p className="scolapro-section-description">{schoolName} · assignments are historical and year-scoped.</p>
          {yearSettings ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Age reference date {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(`${yearSettings.ageReferenceDate}T12:00:00`))} · continuity {yearSettings.assignmentContinuity.replaceAll("_", " ")}
            </p>
          ) : <p className="mt-2 text-xs text-muted-foreground">No year settings are stored for {academicYear}; age-group resolution may therefore be unavailable.</p>}
        </div>
        <YearPicker academicYear={academicYear} years={years} />
      </section>

      <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active houses", activeHouses.length],
          ["Learners assigned", learnerAssignedCount],
          ["Learners unassigned", learnerUnassignedCount],
          ["Staff unassigned", staffUnassignedCount],
        ].map(([label, count], index) => (
          <div key={String(label)} className={`flex items-center justify-between gap-3 px-4 py-4 sm:px-5 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0 xl:border-l" : ""}`}>
            <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{count}</p></div>
            <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span>
          </div>
        ))}
      </div>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4">
          <h2 className="scolapro-section-title">Houses</h2>
          <p className="scolapro-section-description">School-defined names, codes, stored colours, display order and activation state.</p>
        </div>
        <div className="space-y-3">
          {houses.length ? houses.map((house) => <HouseForm key={house.id} schoolId={schoolId} house={house} canManage={canManage} />) : (
            <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No houses configured</p><p className="mt-1 text-xs text-muted-foreground">{canManage ? "Add the first school-defined house below." : "School management has not configured houses yet."}</p></div>
          )}
          <HouseForm schoolId={schoolId} canManage={canManage} />
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4">
          <h2 className="scolapro-section-title">Age groups</h2>
          <p className="scolapro-section-description">Inclusive school-defined ranges. Active groups cannot overlap; backend validation is shown directly.</p>
        </div>
        <div className="space-y-3">
          {ageGroups.length ? ageGroups.map((group) => <AgeGroupForm key={group.id} schoolId={schoolId} group={group} canManage={canManage} />) : (
            <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No age groups configured</p><p className="mt-1 text-xs text-muted-foreground">Age bands remain school-defined rather than system defaults.</p></div>
          )}
          <AgeGroupForm schoolId={schoolId} canManage={canManage} />
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="scolapro-section-title">Learner allocation</h2><p className="scolapro-section-description">{learnerAssignedCount} assigned · {learnerUnassignedCount} unassigned in {academicYear}.</p></div>
          {!canManage ? <span className="text-xs font-medium text-muted-foreground">Read-only</span> : null}
        </div>
        {canManage ? <LearnerAssignmentForm schoolId={schoolId} academicYear={academicYear} learners={learners} houses={houses} /> : null}
        <div className="mt-4 max-h-[34rem] overflow-auto">
          {learners.length ? <div className="divide-y divide-border-subtle">
            {learners.map((learner) => (
              <article key={learner.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,.7fr)_minmax(12rem,.9fr)] sm:items-center">
                <div className="min-w-0"><p className="scolapro-record-title truncate">{learner.name}</p><p className="text-xs text-muted-foreground">{learner.admissionNumber ?? "No admission number"}{learner.ageGroupLabel ? ` · ${learner.ageGroupLabel}` : ""}{learner.ageOnReferenceDate !== null ? ` · age ${learner.ageOnReferenceDate}` : ""}</p></div>
                <div className="flex items-center gap-2"><Swatch color={learner.houseColorHex} /><span className="text-sm font-medium">{learner.houseName ?? "Unassigned"}</span></div>
                <AssignmentMeta source={learner.assignmentSource} locked={learner.isLocked} assignedAt={learner.assignedAt} />
              </article>
            ))}
          </div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center text-sm">No eligible learners for {academicYear}.</div>}
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="scolapro-section-title">Staff allocation & house leaders</h2><p className="scolapro-section-description">{staffAssignedCount} assigned · {staffUnassignedCount} unassigned · {leaders.length} house {leaders.length === 1 ? "leader" : "leaders"} in {academicYear}.</p></div>
          {!canManage ? <span className="text-xs font-medium text-muted-foreground">Read-only</span> : null}
        </div>
        {canManage ? <StaffAssignmentForm schoolId={schoolId} academicYear={academicYear} staff={staff} houses={houses} /> : null}
        <div className="mt-4 max-h-[34rem] overflow-auto">
          {staff.length ? <div className="divide-y divide-border-subtle">
            {staff.map((person) => (
              <article key={person.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,.7fr)_minmax(12rem,.9fr)] sm:items-center">
                <div className="min-w-0"><p className="scolapro-record-title truncate">{person.name}</p><p className="text-xs text-muted-foreground">{person.employeeNumber ?? "No employee number"}{person.roleKey === "leader" ? " · House leader" : ""}</p></div>
                <div className="flex items-center gap-2"><Swatch color={person.houseId ? houses.find((house) => house.id === person.houseId)?.colorHex ?? null : null} /><span className="text-sm font-medium">{person.houseName ?? "Unassigned"}</span></div>
                <AssignmentMeta source={person.assignmentSource} locked={person.isLocked} assignedAt={person.assignedAt} />
              </article>
            ))}
          </div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center text-sm">No eligible staff placements overlap {academicYear}.</div>}
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-xs leading-5 text-muted-foreground">
            Phase 1 uses the existing governed Sports & Houses records only. Locked/manual provenance is preserved; automatic balancing, fixtures, events, scores, medals, records and tournaments are not part of this workspace.
          </p>
        </div>
      </section>
    </div>
  );
}
