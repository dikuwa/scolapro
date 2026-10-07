"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordActionButton } from "@/components/ui/record-action-button";
import { Picker } from "@/components/ui/picker";
import {
  archiveConductGroup,
  archiveConductPolicyItem,
  deleteConductGroup,
  deleteConductPolicyItem,
  initializeConductStarterPolicy,
  moveConductGroup,
  moveConductPolicyItem,
  restoreConductGroup,
  restoreConductPolicyItem,
  saveConductGroup,
  saveConductPolicyItem,
} from "./server/actions";
import { ConductDialog, ConductForm, fieldClass, useConductFormPending } from "./controls";
import type { ConductCategory, ConductPolicyGroup, ConductPolicyType } from "./types";

const severityOptions = ["routine", "moderate", "serious", "critical"].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

function signed(value: number | null) {
  if (value === null) return "No default";
  return value > 0 ? `+${value}` : String(value);
}

function ActionForm({
  action,
  schoolId,
  field,
  id,
  label,
  move,
  variant = "neutral",
}: {
  action: (state: { success?: boolean; message?: string }, data: FormData) => Promise<{ success?: boolean; message?: string }>;
  schoolId: string;
  field: "groupId" | "categoryId";
  id: string;
  label: string;
  move?: "up" | "down";
  variant?: "neutral" | "ghost";
}) {
  return (
    <ConductForm action={action}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name={field} value={id} />
      {move ? <input type="hidden" name="move" value={move} /> : null}
      <Button type="submit" size="sm" variant={variant}>{label}</Button>
    </ConductForm>
  );
}

function GroupEditor({
  schoolId,
  group,
  type,
  nextSortOrder,
  onSaved,
}: {
  schoolId: string;
  group?: ConductPolicyGroup;
  type: ConductPolicyType;
  nextSortOrder: number;
  onSaved: () => void;
}) {
  const pending = useConductFormPending();
  const [severity, setSeverity] = useState(group?.default_severity ?? (type === "violation" ? "routine" : ""));
  return (
    <ConductForm action={saveConductGroup} onSaved={onSaved}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="groupId" value={group?.id ?? ""} />
      <input type="hidden" name="type" value={group?.type ?? type} />
      <input type="hidden" name="code" value={group?.code ?? ""} />
      <input type="hidden" name="sortOrder" value={group?.sort_order ?? nextSortOrder} />
      <label className="block text-xs font-medium">Group name
        <input name="displayName" required maxLength={120} defaultValue={group?.display_name ?? ""} className={fieldClass} placeholder={type === "recognition" ? "General" : "Level 1"} />
      </label>
      <label className="block text-xs font-medium">Default points
        <input name="defaultPoints" type="number" step="1" defaultValue={group?.default_points ?? ""} className={fieldClass} />
      </label>
      {(group?.type ?? type) === "violation" ? (
        <Picker label="Default severity" name="severity" value={severity} onChange={setSeverity} options={severityOptions} placeholder="Choose severity" />
      ) : <input type="hidden" name="severity" value="" />}
      <p className="text-xs leading-5 text-muted-foreground">These are editable school defaults. Items may override points or severity.</p>
      <div className="flex justify-end"><Button type="submit" loading={pending}>{group ? "Save group" : "Add group"}</Button></div>
    </ConductForm>
  );
}

function ItemEditor({
  schoolId,
  groups,
  category,
  initialGroup,
  nextSortOrder,
  onSaved,
}: {
  schoolId: string;
  groups: ConductPolicyGroup[];
  category?: ConductCategory;
  initialGroup: ConductPolicyGroup;
  nextSortOrder: number;
  onSaved: () => void;
}) {
  const pending = useConductFormPending();
  const [groupId, setGroupId] = useState(category?.group_id ?? initialGroup.id);
  const selectedGroup = groups.find((group) => group.id === groupId) ?? initialGroup;
  const [severity, setSeverity] = useState(category?.default_severity ?? selectedGroup.default_severity ?? "routine");
  const [attention, setAttention] = useState(category?.requires_management_attention ? "true" : "false");
  const compatibleGroups = groups.filter((group) => group.type === selectedGroup.type && group.active);
  const domain = category?.domain ?? "conduct";

  return (
    <ConductForm action={saveConductPolicyItem} onSaved={onSaved}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="categoryId" value={category?.id ?? ""} />
      <input type="hidden" name="type" value={selectedGroup.type} />
      <input type="hidden" name="domain" value={domain} />
      <input type="hidden" name="code" value={category?.code ?? ""} />
      <input type="hidden" name="sortOrder" value={category?.sort_order ?? nextSortOrder} />
      <Picker
        label="Group"
        name="groupId"
        value={groupId}
        onChange={(value) => setGroupId(value)}
        options={compatibleGroups.map((group) => ({ value: group.id, label: group.display_name, helper: `${signed(group.default_points)} default` }))}
        placeholder="Choose group"
      />
      <label className="block text-xs font-medium">Conduct item
        <input name="displayName" required maxLength={120} defaultValue={category?.display_name ?? ""} className={fieldClass} placeholder={selectedGroup.type === "recognition" ? "Helpfulness" : "Homework/project not done"} />
      </label>
      <label className="block text-xs font-medium">Points
        <input name="points" type="number" step="1" defaultValue={category?.points ?? selectedGroup.default_points ?? ""} className={fieldClass} />
      </label>
      {selectedGroup.type === "violation" ? (
        <>
          <Picker label="Severity / escalation" name="severity" value={severity} onChange={setSeverity} options={severityOptions} placeholder="Choose severity" />
          <Picker label="Management attention" name="managementAttention" value={attention} onChange={setAttention} options={[{ value: "false", label: "Normal workflow" }, { value: "true", label: "Requires management attention" }]} placeholder="Choose escalation" />
        </>
      ) : <><input type="hidden" name="severity" value="" /><input type="hidden" name="managementAttention" value="false" /></>}
      <p className="text-xs leading-5 text-muted-foreground">Recorded events keep this item’s meaning, points, severity and group snapshot even if the policy changes later.</p>
      <div className="flex justify-end"><Button type="submit" loading={pending}>{category ? "Save conduct item" : "Add conduct item"}</Button></div>
    </ConductForm>
  );
}

export function ConductPolicySettings({
  schoolId,
  groups,
  categories,
}: {
  schoolId: string;
  groups: ConductPolicyGroup[];
  categories: ConductCategory[];
}) {
  const [type, setType] = useState<ConductPolicyType>("recognition");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editingGroup, setEditingGroup] = useState<ConductPolicyGroup | "new" | null>(null);
  const [editingItem, setEditingItem] = useState<{ category?: ConductCategory; group: ConductPolicyGroup } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "group" | "item"; id: string; name: string } | null>(null);

  const activeGroups = groups.filter((group) => group.type === type);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedSearch) return activeGroups;
    return activeGroups.filter((group) =>
      group.display_name.toLowerCase().includes(normalizedSearch) ||
      categories.some((item) => item.group_id === group.id && item.display_name.toLowerCase().includes(normalizedSearch)),
    );
  }, [activeGroups, categories, normalizedSearch]);

  const recognitionGroups = groups.filter((group) => group.type === "recognition" && group.active).length;
  const violationGroups = groups.filter((group) => group.type === "violation" && group.active).length;
  const activeItems = categories.filter((item) => item.active).length;
  const archivedItems = categories.filter((item) => !item.active).length;
  const selectedNewType = editingGroup === "new" ? type : editingGroup?.type ?? type;
  const nextGroupSort = Math.max(0, ...groups.filter((group) => group.type === selectedNewType).map((group) => group.sort_order)) + 10;

  if (!groups.length && !categories.length) {
    return (
      <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
        <h2 className="scolapro-section-title">No conduct policy yet</h2>
        <p className="scolapro-section-description">Create the editable starter Recognition and Violation policy, then adjust it to your school.</p>
        <div className="mt-4">
          <ConductForm action={initializeConductStarterPolicy}>
            <input type="hidden" name="schoolId" value={schoolId} />
            <Button type="submit">Create starter policy</Button>
          </ConductForm>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 lg:grid-cols-4">
        <div className="px-4 py-4 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Recognition groups</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-mint)]">{recognitionGroups}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Violation groups</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-amber)]">{violationGroups}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 lg:border-l lg:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Active items</p><p className="mt-1.5 text-2xl font-semibold">{activeItems}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 lg:border-l lg:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Archived items</p><p className="mt-1.5 text-2xl font-semibold">{archivedItems}</p></div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="scolapro-section-title">Configured policy</h2>
            <p className="scolapro-section-description">Groups are the scan layer. Open one to see items or management actions.</p>
          </div>
          <Button type="button" variant="soft" size="sm" onClick={() => setEditingGroup("new")}><Plus className="size-4" />Add group</Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1" role="group" aria-label="Policy type">
            {(["recognition", "violation"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)} className={`min-h-8 rounded-[var(--radius-xs)] px-3 text-sm font-medium transition ${type === value ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}>
                {value === "recognition" ? "Recognition" : "Violations"}
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search policy</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search groups or conduct items" className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] pl-9 pr-3 text-sm outline-none" />
          </label>
        </div>

        <div className="mt-4 divide-y divide-border-subtle">
          {visibleGroups.length ? visibleGroups.map((group, groupIndex) => {
            const open = expanded.includes(group.id) || Boolean(normalizedSearch);
            const items = categories.filter((item) => item.group_id === group.id).sort((a,b) => a.sort_order-b.sort_order || a.display_name.localeCompare(b.display_name));
            const nextItemSort = Math.max(0, ...items.map((item) => item.sort_order)) + 10;
            return (
              <div key={group.id} className="py-3 first:pt-0 last:pb-0">
                <button type="button" onClick={() => setExpanded((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])} className="flex w-full items-start justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft" aria-expanded={open}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="scolapro-record-title">{group.display_name}</h3>{!group.active ? <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">Archived</span> : null}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{items.filter((item) => item.active).length} active items · {signed(group.default_points)} default{group.type === "violation" && group.default_severity ? ` · ${group.default_severity}` : ""}</p>
                  </div>
                  <ChevronDown className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>

                {open ? (
                  <div className="mt-3 border-t border-border-subtle pt-3">
                    <div className="flex flex-wrap gap-2">
                      <RecordActionButton icon={Pencil} label="Edit group" onClick={() => setEditingGroup(group)} />
                      <ActionForm action={moveConductGroup} schoolId={schoolId} field="groupId" id={group.id} label="Move up" move="up" variant="ghost" />
                      <ActionForm action={moveConductGroup} schoolId={schoolId} field="groupId" id={group.id} label="Move down" move="down" variant="ghost" />
                      {group.active ? <ActionForm action={archiveConductGroup} schoolId={schoolId} field="groupId" id={group.id} label="Archive group" /> : <ActionForm action={restoreConductGroup} schoolId={schoolId} field="groupId" id={group.id} label="Restore group" />}
                      {!group.active ? <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete({ kind: "group", id: group.id, name: group.display_name })}>Delete if unused</Button> : null}
                      {group.active ? <Button type="button" variant="soft" size="sm" onClick={() => setEditingItem({ group })}><Plus className="size-3.5" />Add item</Button> : null}
                    </div>

                    <div className="mt-3 divide-y divide-border-subtle rounded-[var(--radius-sm)] bg-surface-muted px-3">
                      {items.length ? items.map((item, itemIndex) => (
                        <div key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-foreground">{item.display_name}</p>{!item.active ? <span className="rounded-[var(--radius-xs)] bg-surface px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">Archived</span> : null}</div>
                            <p className="mt-1 text-xs text-muted-foreground">{signed(item.points)}{group.type === "violation" && item.default_severity ? ` · ${item.default_severity}` : ""}{item.requires_management_attention ? " · Management attention" : ""}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <RecordActionButton icon={Pencil} label="Edit" variant="ghost" onClick={() => setEditingItem({ category: item, group })} />
                            <ActionForm action={moveConductPolicyItem} schoolId={schoolId} field="categoryId" id={item.id} label="↑" move="up" variant="ghost" />
                            <ActionForm action={moveConductPolicyItem} schoolId={schoolId} field="categoryId" id={item.id} label="↓" move="down" variant="ghost" />
                            {item.active ? <ActionForm action={archiveConductPolicyItem} schoolId={schoolId} field="categoryId" id={item.id} label="Archive" variant="ghost" /> : <ActionForm action={restoreConductPolicyItem} schoolId={schoolId} field="categoryId" id={item.id} label="Restore" variant="ghost" />}
                            {!item.active ? <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete({ kind: "item", id: item.id, name: item.display_name })}>Delete if unused</Button> : null}
                          </div>
                        </div>
                      )) : <p className="py-4 text-sm text-muted-foreground">No conduct items in this group yet.</p>}
                    </div>
                    <p className="mt-2 text-[0.68rem] text-muted-foreground">Group {groupIndex + 1} of {visibleGroups.length} · archived entries stay available for history but cannot be selected for new records.</p>
                  </div>
                ) : null}
              </div>
            );
          }) : <p className="py-6 text-sm text-muted-foreground">No policy groups or items match this search.</p>}
        </div>
      </section>

      {editingGroup ? (
        <ConductDialog title={editingGroup === "new" ? `Add ${type === "recognition" ? "Recognition" : "Violation"} group` : "Edit conduct group"} onClose={() => setEditingGroup(null)}>
          <GroupEditor schoolId={schoolId} group={editingGroup === "new" ? undefined : editingGroup} type={selectedNewType} nextSortOrder={nextGroupSort} onSaved={() => setEditingGroup(null)} />
        </ConductDialog>
      ) : null}

      {editingItem ? (
        <ConductDialog title={editingItem.category ? "Edit conduct item" : "Add conduct item"} onClose={() => setEditingItem(null)}>
          <ItemEditor schoolId={schoolId} groups={groups} category={editingItem.category} initialGroup={editingItem.group} nextSortOrder={Math.max(0, ...categories.filter((item) => item.group_id === editingItem.group.id).map((item) => item.sort_order)) + 10} onSaved={() => setEditingItem(null)} />
        </ConductDialog>
      ) : null}

      {confirmDelete ? (
        <ConductDialog title={confirmDelete.kind === "group" ? "Delete unused group?" : "Delete unused conduct item?"} onClose={() => setConfirmDelete(null)}>
          <p className="text-sm leading-6 text-muted-foreground">Permanent deletion is allowed only when <strong className="text-foreground">{confirmDelete.name}</strong> has no historical references. If it has been used, ScolaPro will keep it and require archive instead.</p>
          <div className="mt-4">
            <ConductForm action={confirmDelete.kind === "group" ? deleteConductGroup : deleteConductPolicyItem} onSaved={() => setConfirmDelete(null)}>
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name={confirmDelete.kind === "group" ? "groupId" : "categoryId"} value={confirmDelete.id} />
              <div className="flex justify-end gap-2"><Button type="button" variant="neutral" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button type="submit">Delete if unused</Button></div>
            </ConductForm>
          </div>
        </ConductDialog>
      ) : null}
    </div>
  );
}
