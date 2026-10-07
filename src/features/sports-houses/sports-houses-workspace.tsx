"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, LockKeyhole, Pencil, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RecordActionButton } from "@/components/ui/record-action-button";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { AssistedBalancingPanel } from "@/features/sports-houses/assisted-balancing-panel";
import { Picker } from "@/components/ui/picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  assignLearnersSportsHouse,
  assignStaffSportsHouse,
  changeSportsHouseStatus,
  saveSportsAgeGroup,
  saveSportsHouse,
  type SportsHousesActionState,
} from "@/features/sports-houses/server/actions";
import type {
  SportsAgeGroup,
  SportsAgeGroupSourceProposal,
  SportsHouse,
  SportsLearner,
  SportsStaff,
  SportsYearSettings,
} from "@/features/sports-houses/server/queries";

const initialState: SportsHousesActionState = {};
const SPORTS_EXPORT_COLUMN_OPTIONS = [
  { value: "admission", label: "Admission No." },
  { value: "grade", label: "Grade" },
  { value: "class", label: "Class" },
  { value: "sex", label: "Sex" },
  { value: "age", label: "Age" },
  { value: "age_group", label: "Age group" },
  { value: "source", label: "Source" },
  { value: "lock", label: "Lock" },
] as const;
const DEFAULT_SPORTS_EXPORT_COLUMNS = ["grade", "class", "sex", "age", "age_group"];
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
  const [state, action, pending] = useActionState(assignLearnersSportsHouse, initialState);
  const [learnerIds, setLearnerIds] = useState<string[]>([]);
  const [houseId, setHouseId] = useState("");
  const [locked, setLocked] = useState("false");
  useActionToast(state);
  const learnerOptions = learners.map((item) => ({
    value: item.id,
    label: item.name,
    helper: [item.admissionNumber, item.isLocked ? "Locked" : item.houseName ? `Current: ${item.houseName}` : "Unassigned"].filter(Boolean).join(" · "),
  }));
  const houseOptions = houses.filter((house) => house.status === "active").map((house) => ({ value: house.id, label: house.name, helper: house.shortCode ?? undefined }));

  return (
    <form action={action} className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted/45 p-3 sm:p-4 lg:grid-cols-[minmax(12rem,1.4fr)_minmax(10rem,1fr)_9rem_auto] lg:items-end">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="academicYear" value={academicYear} />
      {learnerIds.map((id) => <input key={id} type="hidden" name="learnerIds" value={id} />)}
      <SearchableSelect
        label="Learners"
        value=""
        options={learnerOptions}
        placeholder="Choose one or more learners"
        searchPlaceholder="Search learners"
        multiple
        selectedValues={learnerIds}
        onToggle={(id) => setLearnerIds((current) =>
          current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        )}
      />
      <Picker label="House" name="houseId" value={houseId} onChange={setHouseId} placeholder="Choose active house" options={houseOptions} />
      <Picker label="Lock assignment" name="isLocked" value={locked} onChange={setLocked} placeholder="Choose" options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]} />
      <Button type="submit" loading={pending} size="sm" disabled={!learnerIds.length || !houseId}>Assign selected</Button>
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
  sourceAgeGroupProposals,
  learnerAssignedCount,
  learnerUnassignedCount,
  staffAssignedCount,
  staffUnassignedCount,
  canManage,
  balanceOperationId,
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
  sourceAgeGroupProposals: SportsAgeGroupSourceProposal[];
  learnerAssignedCount: number;
  learnerUnassignedCount: number;
  staffAssignedCount: number;
  staffUnassignedCount: number;
  canManage: boolean;
  balanceOperationId: string;
}) {
  const activeHouses = useMemo(() => houses.filter((house) => house.status === "active"), [houses]);
  const leaders = staff.filter((item) => item.roleKey === "leader");
  const houseSummaries = useMemo(() => houses.map((house) => {
    const learnerCount = learners.filter((learner) => learner.houseId === house.id).length;
    const houseStaff = staff.filter((person) => person.houseId === house.id);
    const leaderNames = houseStaff.filter((person) => person.roleKey === "leader").map((person) => person.name);
    return { house, learnerCount, staffCount: houseStaff.length, leaderNames };
  }), [houses, learners, staff]);
  const [editingHouseId, setEditingHouseId] = useState<string | null>(null);
  const [addingHouse, setAddingHouse] = useState(false);
  const [editingAgeGroupId, setEditingAgeGroupId] = useState<string | null>(null);
  const [addingAgeGroup, setAddingAgeGroup] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [learnerAllocationOpen, setLearnerAllocationOpen] = useState(false);
  const [staffAllocationOpen, setStaffAllocationOpen] = useState(false);
  const [learnerHouseFilter, setLearnerHouseFilter] = useState("all");
  const [learnerGradeFilter, setLearnerGradeFilter] = useState("all");
  const [learnerClassFilter, setLearnerClassFilter] = useState("all");
  const [learnerAgeGroupFilter, setLearnerAgeGroupFilter] = useState("all");
  const [learnerSexFilter, setLearnerSexFilter] = useState("all");
  const [learnerSourceFilter, setLearnerSourceFilter] = useState("all");
  const [learnerLockFilter, setLearnerLockFilter] = useState("all");
  const [staffHouseFilter, setStaffHouseFilter] = useState("all");
  const [rosterHouseId, setRosterHouseId] = useState<string | null>(null);
  const [exportHouseIds, setExportHouseIds] = useState<string[]>([]);
  const [exportContent, setExportContent] = useState("combined");
  const [exportGroup, setExportGroup] = useState("none");
  const [exportBlankColumns, setExportBlankColumns] = useState("3");
  const [exportColumns, setExportColumns] = useState<string[]>(DEFAULT_SPORTS_EXPORT_COLUMNS);

  const uniqueOptions = (values: Array<string | null>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));

  const filteredLearners = useMemo(() => learners.filter((learner) => {
    if (learnerHouseFilter === "unassigned" && learner.houseId) return false;
    if (learnerHouseFilter !== "all" && learnerHouseFilter !== "unassigned" && learner.houseId !== learnerHouseFilter) return false;
    if (learnerGradeFilter !== "all" && learner.gradeName !== learnerGradeFilter) return false;
    if (learnerClassFilter !== "all" && learner.registerClassName !== learnerClassFilter) return false;
    if (learnerAgeGroupFilter === "unresolved" && learner.ageGroupLabel) return false;
    if (learnerAgeGroupFilter !== "all" && learnerAgeGroupFilter !== "unresolved" && learner.ageGroupLabel !== learnerAgeGroupFilter) return false;
    if (learnerSexFilter !== "all" && (learner.sex ?? "unspecified") !== learnerSexFilter) return false;
    if (learnerSourceFilter === "unassigned" && learner.assignmentSource) return false;
    if (learnerSourceFilter !== "all" && learnerSourceFilter !== "unassigned" && learner.assignmentSource !== learnerSourceFilter) return false;
    if (learnerLockFilter === "locked" && !learner.isLocked) return false;
    if (learnerLockFilter === "unlocked" && learner.isLocked) return false;
    return true;
  }), [learners, learnerHouseFilter, learnerGradeFilter, learnerClassFilter, learnerAgeGroupFilter, learnerSexFilter, learnerSourceFilter, learnerLockFilter]);

  const filteredStaff = useMemo(() => staff.filter((person) => {
    if (staffHouseFilter === "unassigned") return !person.houseId;
    if (staffHouseFilter === "all") return true;
    return person.houseId === staffHouseFilter;
  }), [staff, staffHouseFilter]);

  const rosterHouse = rosterHouseId ? houses.find((house) => house.id === rosterHouseId) ?? null : null;
  const rosterLearners = rosterHouse ? learners.filter((learner) => learner.houseId === rosterHouse.id) : [];
  const rosterStaff = rosterHouse ? staff.filter((person) => person.houseId === rosterHouse.id) : [];
  const activeSourceProposal = sourceAgeGroupProposals.find((item) => item.status !== "retired") ?? null;
  const exportSelection = exportHouseIds.length ? exportHouseIds : activeHouses.map((house) => house.id);
  const exportQuery = new URLSearchParams({
    school: schoolId,
    year: String(academicYear),
    houses: exportSelection.join(","),
    content: exportContent,
    groupBy: exportGroup,
    blankColumns: exportBlankColumns,
    columns: exportColumns.join(","),
  }).toString();

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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="scolapro-section-title">Houses</h2>
            <p className="scolapro-section-description">Configured houses stay readable; editing opens only when requested.</p>
          </div>
          {canManage ? <Button type="button" variant="neutral" size="sm" onClick={() => setAddingHouse((open) => !open)}><Plus className="size-4" />{addingHouse ? "Close add house" : "Add house"}</Button> : null}
        </div>
        <div className="space-y-2">
          {houseSummaries.length ? houseSummaries.map(({ house, learnerCount, staffCount, leaderNames }) => {
            const editing = editingHouseId === house.id;
            return <div key={house.id} className="overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated">
              <div className="h-1.5 w-full border-b border-border-subtle bg-surface-muted" style={house.colorHex ? { backgroundColor: house.colorHex } : undefined} aria-hidden="true" />
              <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Swatch color={house.colorHex} />
                    <p className="scolapro-record-title">{house.name}</p>
                    {house.shortCode ? <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">{house.shortCode}</span> : null}
                    <span className="text-[0.68rem] capitalize text-muted-foreground">{house.status}</span>
                    {house.colorHex ? <span className="text-[0.68rem] font-medium text-muted-foreground">{house.colorHex}</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><strong className="font-semibold text-foreground">{learnerCount}</strong> learners</span>
                    <span><strong className="font-semibold text-foreground">{staffCount}</strong> staff</span>
                    <span>House leader: <strong className="font-semibold text-foreground">{leaderNames.length ? leaderNames.join(", ") : "Not assigned"}</strong></span>
                  </div>
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">Display order {house.sortOrder} · Created {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(house.createdAt))}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="neutral" size="sm" onClick={() => setRosterHouseId(rosterHouseId === house.id ? null : house.id)}>Open roster</Button>
                    <OfficialDocumentActions
                      previewHref={`/api/official-documents/sports-house-roster?school=${schoolId}&year=${academicYear}&houses=${house.id}&blankColumns=3&format=pdf&preview=1`}
                      downloadHref={`/api/official-documents/sports-house-roster?school=${schoolId}&year=${academicYear}&houses=${house.id}&blankColumns=3&format=pdf`}
                      spreadsheetHref={`/api/official-documents/sports-house-roster?school=${schoolId}&year=${academicYear}&houses=${house.id}&blankColumns=3&format=xlsx`}
                      compact
                    />
                  </div>
                </div>
                {canManage ? editing ? <Button type="button" variant="neutral" size="sm" onClick={() => setEditingHouseId(null)}><ChevronDown className="size-4" />Close</Button> : <RecordActionButton icon={Pencil} label="Edit" onClick={() => setEditingHouseId(house.id)} /> : null}
              </div>
              {editing ? <div className="border-t border-border-subtle p-3 sm:p-4"><HouseForm schoolId={schoolId} house={house} canManage={canManage} /></div> : null}
            </div>;
          }) : (
            <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No houses configured</p><p className="mt-1 text-xs text-muted-foreground">{canManage ? "Use Add house to configure the first house." : "School management has not configured houses yet."}</p></div>
          )}
          {addingHouse ? <HouseForm schoolId={schoolId} canManage={canManage} /> : null}
        </div>
      </section>

      {rosterHouse ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="scolapro-section-title">{rosterHouse.name} operational roster</h2><p className="scolapro-section-description">{rosterLearners.length} learners · {rosterStaff.length} staff · {rosterStaff.filter((person) => person.roleKey === "leader").map((person) => person.name).join(", ") || "No house leader recorded"}</p></div>
          <Button type="button" variant="neutral" size="sm" onClick={() => setRosterHouseId(null)}>Close roster</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-xs">
            <thead className="border-b border-border-subtle text-muted-foreground"><tr><th className="px-2 py-2">Learner</th><th className="px-2 py-2">Grade</th><th className="px-2 py-2">Class</th><th className="px-2 py-2">Sex</th><th className="px-2 py-2">Age</th><th className="px-2 py-2">Age group</th><th className="px-2 py-2">Source</th><th className="px-2 py-2">Lock</th></tr></thead>
            <tbody className="divide-y divide-border-subtle">{rosterLearners.map((learner) => <tr key={learner.id}><td className="px-2 py-2 font-medium">{learner.name}</td><td className="px-2 py-2">{learner.gradeName ?? "—"}</td><td className="px-2 py-2">{learner.registerClassName ?? "—"}</td><td className="px-2 py-2">{learner.sex ?? "—"}</td><td className="px-2 py-2">{learner.ageOnReferenceDate ?? "—"}</td><td className="px-2 py-2">{learner.ageGroupLabel ?? "Unresolved"}</td><td className="px-2 py-2">{learner.assignmentSource ?? "—"}</td><td className="px-2 py-2">{learner.isLocked ? "Locked" : "Unlocked"}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="mt-4 border-t border-border-subtle pt-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{rosterStaff.map((person) => <div key={person.id} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-xs"><p className="font-semibold">{person.name}</p><p className="mt-1 text-muted-foreground">{person.roleKey === "leader" ? "House leader" : "Member"} · {person.assignmentSource ?? "Unknown source"} · {person.isLocked ? "Locked" : "Unlocked"}</p></div>)}</div></div>
      </section> : null}

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="scolapro-section-title">Age groups</h2>
            <p className="scolapro-section-description">Configured age bands stay compact until you choose to edit them.</p>
          </div>
          {canManage ? <Button type="button" variant="neutral" size="sm" onClick={() => setAddingAgeGroup((open) => !open)}><Plus className="size-4" />{addingAgeGroup ? "Close add group" : "Add age group"}</Button> : null}
        </div>
        <div className="space-y-2">
          {ageGroups.length ? ageGroups.map((group) => {
            const editing = editingAgeGroupId === group.id;
            return <div key={group.id} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated">
              <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div><p className="scolapro-record-title">{group.label}</p><p className="mt-1 text-xs text-muted-foreground">Ages {group.minAge}–{group.maxAge} · Display order {group.sortOrder}</p></div>
                {canManage ? editing ? <Button type="button" variant="neutral" size="sm" onClick={() => setEditingAgeGroupId(null)}><ChevronDown className="size-4" />Close</Button> : <RecordActionButton icon={Pencil} label="Edit" onClick={() => setEditingAgeGroupId(group.id)} /> : null}
              </div>
              {editing ? <div className="border-t border-border-subtle p-3 sm:p-4"><AgeGroupForm schoolId={schoolId} group={group} canManage={canManage} /></div> : null}
            </div>;
          }) : (
            <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No age groups configured</p><p className="mt-1 text-xs text-muted-foreground">Age bands remain school-defined rather than system defaults.</p></div>
          )}
          {addingAgeGroup ? <AgeGroupForm schoolId={schoolId} canManage={canManage} /> : null}
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="scolapro-section-title">Source-informed age-group proposal</h2><p className="scolapro-section-description">{activeSourceProposal ? activeSourceProposal.sourceTitle : "No source proposal is stored for this year."}</p></div>
          {activeSourceProposal ? <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-strong capitalize">{activeSourceProposal.status}</span> : null}
        </div>
        {activeSourceProposal ? <div className="mt-3"><div className="flex flex-wrap gap-1.5">{activeSourceProposal.labels.map((label) => <span key={label} className="rounded-[var(--radius-xs)] bg-surface px-2 py-1 text-xs font-semibold">{label}</span>)}</div><p className="mt-3 text-xs leading-5 text-muted-foreground">Source labels are proposals only. The source does not prove the formal cutoff/reference date. School management verifies the reference date and min/max rules before canonical age groups are configured; source labels never rewrite learners.</p><p className="mt-2 text-xs font-medium text-muted-foreground">{yearSettings && ageGroups.length ? "Canonical rules are configured; derived roster labels can now be compared with source evidence." : "Mismatch comparison is pending canonical reference-date and age-band configuration."}</p></div> : null}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="scolapro-section-title">House roster exports</h2><p className="scolapro-section-description">Choose one or multiple houses; leave empty to export all active houses.</p></div><OfficialDocumentActions previewHref={`/api/official-documents/sports-house-roster?${exportQuery}&format=pdf&preview=1`} downloadHref={`/api/official-documents/sports-house-roster?${exportQuery}&format=pdf`} spreadsheetHref={`/api/official-documents/sports-house-roster?${exportQuery}&format=xlsx`} /></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SearchableSelect label="Houses" value="" options={activeHouses.map((house) => ({ value: house.id, label: house.name }))} placeholder="All active houses" searchPlaceholder="Search houses" multiple selectedValues={exportHouseIds} onToggle={(id) => setExportHouseIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current,id])} />
          <Picker label="Include" placeholder="Choose content" value={exportContent} onChange={setExportContent} options={[{ value: "combined", label: "Learners + staff" },{ value: "learners", label: "Learners only" },{ value: "staff", label: "Staff only" }]} />
          <Picker label="Group learners by" placeholder="Choose grouping" value={exportGroup} onChange={setExportGroup} options={[{ value: "none", label: "No grouping" },{ value: "age_group", label: "Age group" },{ value: "sex", label: "Sex" },{ value: "grade", label: "Grade" },{ value: "class", label: "Register class" }]} />
          <Picker label="Blank columns" placeholder="Choose blank columns" value={exportBlankColumns} onChange={setExportBlankColumns} options={Array.from({ length: 7 }, (_, index) => ({ value: String(index), label: index === 0 ? "None" : `${index} blank column${index === 1 ? "" : "s"}` }))} />
          <SearchableSelect label="Print columns" value="" options={SPORTS_EXPORT_COLUMN_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} placeholder="Choose columns" searchPlaceholder="Search columns" multiple selectedValues={exportColumns} onToggle={(value) => setExportColumns((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />
        </div>
      </section>

      {canManage ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <button type="button" onClick={() => setBalanceOpen((open) => !open)} className="flex w-full items-center justify-between gap-4 text-left">
          <div><h2 className="scolapro-section-title">Assisted balancing</h2><p className="scolapro-section-description">Preview deterministic learner balancing only when you need it.</p></div>
          {balanceOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        </button>
        {balanceOpen ? <div className="mt-4 border-t border-border-subtle pt-4"><AssistedBalancingPanel schoolId={schoolId} academicYear={academicYear} operationId={balanceOperationId} /></div> : null}
      </section> : null}

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="scolapro-section-title">Learner allocation</h2><p className="scolapro-section-description">{learnerAssignedCount} assigned · {learnerUnassignedCount} unassigned in {academicYear}.</p></div>
          {canManage ? <Button type="button" variant="neutral" size="sm" onClick={() => setLearnerAllocationOpen((open) => !open)}>{learnerAllocationOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{learnerAllocationOpen ? "Close allocation" : "Manage allocation"}</Button> : <span className="text-xs font-medium text-muted-foreground">Read-only</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Picker label="House" placeholder="All houses" value={learnerHouseFilter} onChange={setLearnerHouseFilter} options={[{ value: "all", label: "All houses" },{ value: "unassigned", label: "Unassigned" },...activeHouses.map((house) => ({ value: house.id, label: house.name }))]} />
          <Picker label="Grade" placeholder="All grades" value={learnerGradeFilter} onChange={setLearnerGradeFilter} options={[{ value: "all", label: "All grades" },...uniqueOptions(learners.map((item) => item.gradeName)).map((value) => ({ value, label: value }))]} />
          <Picker label="Register class" placeholder="All classes" value={learnerClassFilter} onChange={setLearnerClassFilter} options={[{ value: "all", label: "All classes" },...uniqueOptions(learners.map((item) => item.registerClassName)).map((value) => ({ value, label: value }))]} />
          <Picker label="Age group" placeholder="All age groups" value={learnerAgeGroupFilter} onChange={setLearnerAgeGroupFilter} options={[{ value: "all", label: "All age groups" },{ value: "unresolved", label: "Unresolved" },...uniqueOptions(learners.map((item) => item.ageGroupLabel)).map((value) => ({ value, label: value }))]} />
          <Picker label="Sex" placeholder="All" value={learnerSexFilter} onChange={setLearnerSexFilter} options={[{ value: "all", label: "All" },...uniqueOptions(learners.map((item) => item.sex ?? "unspecified")).map((value) => ({ value, label: value }))]} />
          <Picker label="Source" placeholder="All sources" value={learnerSourceFilter} onChange={setLearnerSourceFilter} options={[{ value: "all", label: "All sources" },{ value: "unassigned", label: "Unassigned" },...uniqueOptions(learners.map((item) => item.assignmentSource)).map((value) => ({ value, label: value }))]} />
          <Picker label="Lock" placeholder="All" value={learnerLockFilter} onChange={setLearnerLockFilter} options={[{ value: "all", label: "All" },{ value: "locked", label: "Locked" },{ value: "unlocked", label: "Unlocked" }]} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{filteredLearners.length} of {learners.length} learners shown.</p>
        {canManage && learnerAllocationOpen ? <div className="mt-4"><LearnerAssignmentForm schoolId={schoolId} academicYear={academicYear} learners={filteredLearners} houses={houses} /></div> : null}
        <div className="mt-4 max-h-[34rem] overflow-auto">
          {filteredLearners.length ? <div className="divide-y divide-border-subtle">
            {filteredLearners.map((learner) => (
              <article key={learner.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,.7fr)_minmax(12rem,.9fr)] sm:items-center">
                <div className="min-w-0"><p className="scolapro-record-title truncate">{learner.name}</p><p className="text-xs text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.gradeName ?? "No grade"} · {learner.registerClassName ?? "No class"} · {learner.sex ?? "unspecified"}{learner.ageGroupLabel ? ` · ${learner.ageGroupLabel}` : ""}{learner.ageOnReferenceDate !== null ? ` · age ${learner.ageOnReferenceDate}` : ""}</p></div>
                <div className="flex items-center gap-2"><Swatch color={learner.houseColorHex} /><span className="text-sm font-medium">{learner.houseName ?? "Unassigned"}</span></div>
                <AssignmentMeta source={learner.assignmentSource} locked={learner.isLocked} assignedAt={learner.assignedAt} />
              </article>
            ))}
          </div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center text-sm">No eligible learners for {academicYear}.</div>}
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="scolapro-section-title">Staff allocation & house leaders</h2><p className="scolapro-section-description">{staffAssignedCount} assigned · {staffUnassignedCount} unassigned · {leaders.length} house {leaders.length === 1 ? "leader" : "leaders"} in {academicYear}.</p></div>
          {canManage ? <Button type="button" variant="neutral" size="sm" onClick={() => setStaffAllocationOpen((open) => !open)}>{staffAllocationOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{staffAllocationOpen ? "Close allocation" : "Manage allocation"}</Button> : <span className="text-xs font-medium text-muted-foreground">Read-only</span>}
        </div>
        <div className="max-w-xs"><Picker label="Staff house" placeholder="All houses" value={staffHouseFilter} onChange={setStaffHouseFilter} options={[{ value: "all", label: "All houses" },{ value: "unassigned", label: "Unassigned" },...activeHouses.map((house) => ({ value: house.id, label: house.name }))]} /></div>
        <p className="mt-2 text-xs text-muted-foreground">{filteredStaff.length} of {staff.length} staff shown.</p>
        {canManage && staffAllocationOpen ? <div className="mt-4"><StaffAssignmentForm schoolId={schoolId} academicYear={academicYear} staff={filteredStaff} houses={houses} /></div> : null}
        <div className="mt-4 max-h-[34rem] overflow-auto">
          {filteredStaff.length ? <div className="divide-y divide-border-subtle">
            {filteredStaff.map((person) => (
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
            Houses and assignments remain canonical. Assisted balancing is deterministic, preview-first and auditable; manual/locked assignments and staff leaders are preserved. Fixtures, events, scores, medals, records and tournaments remain outside this workspace.
          </p>
        </div>
      </section>
    </div>
  );
}
