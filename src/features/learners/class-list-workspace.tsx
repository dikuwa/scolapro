"use client";

import { useRouter } from "next/navigation";
import { Save, Search, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { buildOfficialClassListColumns, classListDocumentName } from "@/features/documents/server/class-list-document";
import { ClassListDocumentActions } from "@/features/learners/class-list-document-actions";
import {
  classListColumnIds,
  classListColumnLabels,
  type ClassListBatchWorkspaceData,
  type ClassListColumnId,
  type ClassListConfiguration,
  type ClassListRosterType,
  type ClassListTarget,
  type ClassListWorkspaceData,
} from "@/features/learners/class-list-types";

const rosterTypeOptions: Array<{ value: ClassListRosterType; label: string }> = [
  { value: "register_class", label: "Register class" },
  { value: "grade", label: "Grade" },
  { value: "subject", label: "Subject" },
  { value: "teacher_subject", label: "Teacher + subject" },
  { value: "teaching_group", label: "Teaching Group" },
  { value: "field_group", label: "Field / academic group" },
];
const guardianColumns = new Set<ClassListColumnId>(["guardianName", "guardianPhone", "guardianAddress", "emergencyContact"]);
const PRESETS_KEY = "scolapro:class-list-presets:v1";

type StoredConfiguration = { id: string; name: string; configuration: ClassListConfiguration };

function readStored(key: string): StoredConfiguration[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === "string" && item.configuration) : [];
  } catch {
    return [];
  }
}

function configurationParams(
  configuration: ClassListConfiguration,
  academicYear: number,
  targets: ClassListTarget[],
) {
  const params = new URLSearchParams({
    year: String(academicYear),
    scope: configuration.scope,
    rosterType: configuration.rosterType,
    rosterId: targets[0]?.rosterId ?? configuration.rosterId,
    columns: configuration.columns.join(","),
    blankColumns: String(configuration.blankColumns),
  });
  for (const target of targets) params.append("target", `${target.rosterType}:${target.rosterId}`);
  return params;
}

function targetKey(target: ClassListTarget) {
  return `${target.rosterType}:${target.rosterId}`;
}

function RosterMultiSelect({
  options,
  rosterType,
  selected,
  onToggle,
}: {
  options: ClassListWorkspaceData["options"][ClassListRosterType];
  rosterType: ClassListRosterType;
  selected: ClassListTarget[];
  onToggle: (target: ClassListTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const selectedIds = new Set(selected.filter((item) => item.rosterType === rosterType).map((item) => item.rosterId));
  const filtered = normalized
    ? options.filter((item) => `${item.label} ${item.helper}`.toLocaleLowerCase().includes(normalized))
    : options;

  return (
    <div>
      <label htmlFor="class-list-roster-search" className="text-xs font-medium">Rosters</label>
      <div className="mt-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-xs)]">
        <div className="relative border-b border-border-subtle">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="class-list-roster-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search available rosters"
            className="min-h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <div role="listbox" aria-multiselectable="true" className="max-h-64 overflow-auto p-1">
          {filtered.length ? filtered.map((option) => {
            const checked = selectedIds.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => onToggle({ rosterType, rosterId: option.id })}
                className={`flex w-full items-start gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none ${checked ? "bg-brand-soft text-brand-strong" : ""}`}
              >
                <span aria-hidden="true" className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[0.62rem] font-bold ${checked ? "border-[color:var(--brand)] bg-brand text-white" : "border-border"}`}>{checked ? "✓" : ""}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{option.label}</span><span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">{option.helper}</span></span>
              </button>
            );
          }) : <p className="px-2.5 py-3 text-xs text-muted-foreground">No matching rosters.</p>}
        </div>
      </div>
    </div>
  );
}

function targetLabel(data: ClassListWorkspaceData, target: ClassListTarget) {
  return data.options[target.rosterType].find((item) => item.id === target.rosterId)?.label ?? "Unavailable roster";
}

export function ClassListWorkspace({
  data,
  batch,
}: {
  data: ClassListWorkspaceData;
  batch: ClassListBatchWorkspaceData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [configuration, setConfiguration] = useState(data.configuration);
  const [targets, setTargets] = useState<ClassListTarget[]>(batch.targets);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<StoredConfiguration[]>([]);

  useEffect(() => {
    const handle = window.setTimeout(() => setPresets(readStored(PRESETS_KEY)), 0);
    return () => window.clearTimeout(handle);
  }, []);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setConfiguration(data.configuration);
      setTargets(batch.targets);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data.configuration, batch.targets]);

  const currentRosterOptions = data.options[configuration.rosterType];
  const exportParams = configurationParams(configuration, data.academicYear, targets);
  const exportBase = `/api/official-documents/class-list?${exportParams.toString()}`;
  const availableColumns = classListColumnIds.filter((column) => data.canViewGuardianFields || !guardianColumns.has(column));
  const addableColumns = availableColumns.filter((column) => !configuration.columns.includes(column));
  const selectedKeys = useMemo(() => new Set(targets.map(targetKey)), [targets]);
  const batchMatchesServer = targets.length === batch.targets.length && targets.every((item) => batch.targets.some((current) => targetKey(current) === targetKey(item)));

  function patch(next: Partial<ClassListConfiguration>) {
    setConfiguration((current) => ({ ...current, ...next }));
  }

  function toggleTarget(target: ClassListTarget) {
    setTargets((current) => {
      const key = targetKey(target);
      if (current.some((item) => targetKey(item) === key)) return current.filter((item) => targetKey(item) !== key);

      let next = current;
      if (target.rosterType === "grade") {
        const gradeLabel = data.options.grade.find((item) => item.id === target.rosterId)?.label;
        if (gradeLabel) next = next.filter((item) => item.rosterType !== "register_class" || data.options.register_class.find((option) => option.id === item.rosterId)?.helper !== gradeLabel);
      }
      if (target.rosterType === "register_class") {
        const gradeLabel = data.options.register_class.find((item) => item.id === target.rosterId)?.helper;
        if (gradeLabel) {
          const parentGradeIds = new Set(data.options.grade.filter((item) => item.label === gradeLabel).map((item) => item.id));
          next = next.filter((item) => item.rosterType !== "grade" || !parentGradeIds.has(item.rosterId));
        }
      }
      return [...next, target].slice(0, 20);
    });
  }

  function preview() {
    if (!targets.length) {
      toast.error("Select at least one roster.");
      return;
    }
    const params = configurationParams(configuration, data.academicYear, targets);
    startTransition(() => router.push(`/class-lists?${params.toString()}`, { scroll: false }));
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) { toast.error("Enter a preset name first."); return; }
    const item: StoredConfiguration = { id: crypto.randomUUID(), name, configuration };
    const next = [item, ...presets].slice(0, 12);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setPresets(next);
    setPresetName("");
    toast.success("Class-list preset saved.");
  }

  function removePreset(id: string) {
    const next = presets.filter((item) => item.id !== id);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setPresets(next);
  }

  function applyStored(item: StoredConfiguration) {
    const allowedColumns = item.configuration.columns.filter((column) => data.canViewGuardianFields || !guardianColumns.has(column));
    setConfiguration((current) => ({
      ...current,
      columns: allowedColumns,
      blankColumns: item.configuration.blankColumns,
    }));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3 border-b border-border-subtle pb-4">
          <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span>
          <div><h2 className="scolapro-section-title">Build class lists</h2><p className="scolapro-section-description !mt-0">Select one or many governed rosters. Every selected roster remains an independent list.</p></div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[12rem_14rem_minmax(18rem,1fr)] lg:items-start">
          <Picker label="Scope" value={configuration.scope} onChange={(value) => { patch({ scope: value === "all" ? "all" : "my" }); setTargets([]); }} placeholder="My Classes"
            options={[{ value: "my", label: "My Classes" }, { value: "all", label: "All", helper: "School-wide active rosters" }]} />
          <Picker label="Roster type" value={configuration.rosterType} onChange={(value) => patch({ rosterType: value as ClassListRosterType, rosterId: "" })} placeholder="Choose roster type" options={rosterTypeOptions} />
          <RosterMultiSelect options={currentRosterOptions} rosterType={configuration.rosterType} selected={targets} onToggle={toggleTarget} />
        </div>
        <div className="mt-4 border-t border-border-subtle pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-xs font-semibold">Selected</h3><p className="mt-0.5 text-xs text-muted-foreground">{targets.length} list{targets.length === 1 ? "" : "s"} · {batchMatchesServer ? batch.totalLearners : "Preview to refresh"} learner{batch.totalLearners === 1 ? "" : "s"}</p></div>
            {targets.length ? <button type="button" onClick={() => setTargets([])} className="text-xs font-medium text-muted-foreground hover:text-foreground">Clear all</button> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {targets.length ? targets.map((target) => (
              <button key={targetKey(target)} type="button" onClick={() => toggleTarget(target)} aria-label={`Remove ${targetLabel(data, target)}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-xs font-medium text-brand-strong">
                {targetLabel(data, target)} <X className="size-3" aria-hidden="true" />
              </button>
            )) : <span className="text-xs text-muted-foreground">No rosters selected.</span>}
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div><h2 className="scolapro-section-title">Choose details</h2><p className="scolapro-section-description">No. and Learner are fixed. Optional fields apply once to the complete batch.</p></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex min-h-8 items-center rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-xs font-medium">No. 🔒</span>
          <span className="inline-flex min-h-8 items-center rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-xs font-medium">Learner 🔒</span>
          {configuration.columns.map((column) => (
            <button key={column} type="button" onClick={() => patch({ columns: configuration.columns.filter((item) => item !== column) })} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-xs font-medium text-brand-strong">
              {classListColumnLabels[column]} <X className="size-3" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem] md:items-end">
          <Picker
            label="+ Add columns"
            value=""
            onChange={(value) => value && patch({ columns: [...configuration.columns, value as ClassListColumnId] })}
            placeholder={addableColumns.length ? "Choose optional field" : "All available fields selected"}
            disabled={!addableColumns.length}
            searchable
            searchPlaceholder="Search optional fields"
            options={addableColumns.map((column) => ({ value: column, label: classListColumnLabels[column] }))}
          />
          <Picker label="Blank columns" value={String(configuration.blankColumns)} onChange={(value) => patch({ blankColumns: Number(value) })} placeholder="No blank columns" options={Array.from({ length: 7 }, (_, index) => ({ value: String(index), label: index === 0 ? "None" : `${index} blank column${index === 1 ? "" : "s"}` }))} />
        </div>
        {!data.canViewGuardianFields ? <p className="mt-3 text-xs text-muted-foreground">Guardian and contact columns are hidden because this role does not have guardian-directory authority.</p> : null}
        <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-[minmax(14rem,1fr)_auto] sm:items-end">
          <div><label htmlFor="preset-name" className="text-xs font-medium">Preset name</label><input id="preset-name" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="e.g. Parent contact list" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></div>
          <button type="button" onClick={savePreset} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-4 text-sm font-medium hover:bg-brand-soft"><Save className="size-4" aria-hidden="true" />Save preset</button>
        </div>
        {presets.length ? <div className="mt-3 flex flex-wrap gap-2">{presets.map((item) => <span key={item.id} className="inline-flex items-center rounded-[var(--radius-xs)] bg-surface-muted text-xs"><button type="button" onClick={() => applyStored(item)} className="px-2.5 py-1.5 font-medium">{item.name}</button><button type="button" aria-label={`Remove preset ${item.name}`} onClick={() => removePreset(item.id)} className="px-2 py-1.5 text-muted-foreground hover:text-foreground"><X className="size-3" /></button></span>)}</div> : null}
        <button type="button" disabled={!targets.length || pending} onClick={preview} className="scolapro-cta mt-4 inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? <Spinner className="size-4 text-white" /> : <Search className="size-4" aria-hidden="true" />}{pending ? "Preparing preview…" : "Preview batch"}</button>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]" aria-busy={pending}>
        <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><h2 className="scolapro-section-title">Preview</h2><p className="scolapro-section-description">{batch.targets.length} list{batch.targets.length === 1 ? "" : "s"} · {batch.totalLearners} learner{batch.totalLearners === 1 ? "" : "s"}</p></div>
          {targets.length ? <ClassListDocumentActions baseHref={exportBase} batch={targets.length > 1} /> : null}
        </div>
        {batch.lists.length ? <div className="space-y-5 p-4 sm:p-5">
          {batch.lists.map((list) => {
            const previewColumns = buildOfficialClassListColumns(configuration.columns, configuration.blankColumns);
            return <section key={`${list.configuration.rosterType}:${list.configuration.rosterId}`} className="overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle">
              <div className="flex flex-wrap items-baseline justify-between gap-2 bg-surface-muted px-3 py-2.5"><h3 className="text-sm font-semibold">{classListDocumentName(list.className, list.title)}</h3><span className="text-xs text-muted-foreground">{list.learners.length} learners</span></div>
              {list.learners.length ? <div className="max-h-[52vh] w-full overflow-auto overscroll-contain">
                <table className="w-full min-w-[48rem] table-auto border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-surface-muted"><tr>{previewColumns.map((column) => <th key={column.key} className={`whitespace-nowrap border border-border-subtle px-2.5 py-2 font-semibold ${column.key.startsWith("blank-") ? "min-w-28" : ""}`}>{column.label || "Blank"}</th>)}</tr></thead>
                  <tbody>{list.learners.map((learner, index) => <tr key={learner.learnerId} className="hover:bg-surface-muted/55">{previewColumns.map((column) => <td key={column.key} className={`border border-border-subtle px-2.5 py-2 ${column.key === "learner" ? "font-medium" : "text-muted-foreground"} ${column.key === "guardianAddress" ? "min-w-44 whitespace-pre-line" : "whitespace-nowrap"} ${column.key.startsWith("blank-") ? "min-w-28" : ""}`}>{column.value(learner, index) || <span aria-label="Blank column">&nbsp;</span>}</td>)}</tr>)}</tbody>
                </table>
              </div> : <div className="px-5 py-8 text-center text-xs text-muted-foreground">No learners in this roster.</div>}
            </section>;
          })}
        </div> : <div className="px-5 py-12 text-center"><UsersRound className="mx-auto size-5 text-muted-foreground" /><h3 className="mt-2 text-sm font-semibold">No class lists selected</h3><p className="mt-1 text-xs text-muted-foreground">Select one or more rosters above, then preview the batch.</p></div>}
      </section>
    </div>
  );
}
