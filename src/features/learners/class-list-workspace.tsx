"use client";

import { useRouter } from "next/navigation";
import { Save, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { buildOfficialClassListColumns } from "@/features/documents/server/class-list-document";
import { ClassListDocumentActions } from "@/features/learners/class-list-document-actions";
import {
  classListColumnIds,
  classListColumnLabels,
  type ClassListColumnId,
  type ClassListConfiguration,
  type ClassListRosterType,
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
const guardianColumns = new Set<ClassListColumnId>(["guardianName", "guardianPhone", "emergencyContact"]);
const PRESETS_KEY = "scolapro:class-list-presets:v1";
const RECENTS_KEY = "scolapro:class-list-recents:v1";

type StoredConfiguration = { id: string; name: string; configuration: ClassListConfiguration };

function readStored(key: string): StoredConfiguration[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === "string" && item.configuration) : [];
  } catch {
    return [];
  }
}

function configurationParams(configuration: ClassListConfiguration, academicYear: number) {
  const params = new URLSearchParams({
    year: String(academicYear), scope: configuration.scope, rosterType: configuration.rosterType,
    rosterId: configuration.rosterId, columns: configuration.columns.join(","), blankColumns: String(configuration.blankColumns),
  });
  return params;
}

function ColumnToggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={onChange}
      className="flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-xs transition hover:border-border focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-45">
      <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-[var(--radius-xs)] border text-xs font-bold ${checked ? "border-[color:var(--brand)] bg-brand text-white" : "border-border bg-surface"}`}>{checked ? "✓" : ""}</span>
      {label}
    </button>
  );
}

export function ClassListWorkspace({ data }: { data: ClassListWorkspaceData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [configuration, setConfiguration] = useState(data.configuration);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<StoredConfiguration[]>([]);
  const [recents, setRecents] = useState<StoredConfiguration[]>([]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPresets(readStored(PRESETS_KEY));
      setRecents(readStored(RECENTS_KEY));
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);
  useEffect(() => {
    const handle = window.setTimeout(() => setConfiguration(data.configuration), 0);
    return () => window.clearTimeout(handle);
  }, [data.configuration]);

  const rosterOptions = data.options[configuration.rosterType];
  const previewColumns = useMemo(() => buildOfficialClassListColumns(data.configuration.columns, data.configuration.blankColumns), [data.configuration]);
  const exportParams = configurationParams(data.configuration, data.academicYear);
  const exportBase = `/api/official-documents/class-list?${exportParams.toString()}`;

  function patch(next: Partial<ClassListConfiguration>) {
    setConfiguration((current) => ({ ...current, ...next }));
  }

  function preview(nextConfiguration = configuration) {
    const params = configurationParams(nextConfiguration, data.academicYear);
    const selected = data.options[nextConfiguration.rosterType].find((item) => item.id === nextConfiguration.rosterId);
    const recent: StoredConfiguration = { id: crypto.randomUUID(), name: selected?.label ?? "Class list", configuration: nextConfiguration };
    const nextRecents = [recent, ...readStored(RECENTS_KEY).filter((item) => JSON.stringify(item.configuration) !== JSON.stringify(nextConfiguration))].slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(nextRecents));
    setRecents(nextRecents);
    startTransition(() => router.push(`/class-lists?${params.toString()}`, { scroll: false }));
  }

  function clearRecents() {
    localStorage.removeItem(RECENTS_KEY);
    setRecents([]);
    toast.success("Recent class lists cleared.");
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) { toast.error("Enter a preset name first."); return; }
    const item: StoredConfiguration = { id: crypto.randomUUID(), name, configuration };
    const next = [item, ...presets].slice(0, 12);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setPresets(next); setPresetName(""); toast.success("Class-list preset saved.");
  }

  function applyStored(item: StoredConfiguration) {
    const allowedColumns = item.configuration.columns.filter((column) => data.canViewGuardianFields || !guardianColumns.has(column));
    const next = { ...item.configuration, columns: allowedColumns };
    setConfiguration(next); preview(next);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3 border-b border-border-subtle pb-4">
          <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span>
          <div><h2 className="scolapro-section-title">Choose roster</h2><p className="scolapro-section-description !mt-0">All active school rosters are available to current staff. Use My Classes when you only need your own allocations or register responsibility.</p></div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 md:items-end">
          <Picker label="Scope" value={configuration.scope} onChange={(value) => preview({ ...configuration, scope: value === "all" ? "all" : "my", rosterId: "" })} placeholder="My Classes"
            options={[{ value: "my", label: "My Classes" }, { value: "all", label: "All", helper: "School-wide active rosters" }]} />
          <Picker label="Roster type" value={configuration.rosterType} onChange={(value) => patch({ rosterType: value as ClassListRosterType, rosterId: data.options[value as ClassListRosterType][0]?.id ?? "" })} placeholder="Choose roster type" options={rosterTypeOptions} />
          <Picker label="Roster" value={configuration.rosterId} onChange={(value) => patch({ rosterId: value })} placeholder="Choose roster" searchable searchPlaceholder="Search available rosters" options={rosterOptions.map((item) => ({ value: item.id, label: item.label, helper: item.helper }))} />
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div><h2 className="scolapro-section-title">Choose columns</h2><p className="scolapro-section-description">No. and Learner are fixed. Add only the details needed for this list.</p></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ColumnToggle checked disabled label="No. (fixed)" onChange={() => undefined} />
          <ColumnToggle checked disabled label="Learner (fixed)" onChange={() => undefined} />
          {classListColumnIds.filter((column) => data.canViewGuardianFields || !guardianColumns.has(column)).map((column) => (
            <ColumnToggle key={column} label={classListColumnLabels[column]} checked={configuration.columns.includes(column)} onChange={() => patch({ columns: configuration.columns.includes(column) ? configuration.columns.filter((item) => item !== column) : [...configuration.columns, column] })} />
          ))}
        </div>
        {!data.canViewGuardianFields ? <p className="mt-3 text-xs text-muted-foreground">Guardian and contact columns are hidden because this role does not have guardian-directory authority.</p> : null}
        <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-[12rem_minmax(14rem,1fr)_auto] sm:items-end">
          <Picker label="Blank columns" value={String(configuration.blankColumns)} onChange={(value) => patch({ blankColumns: Number(value) })} placeholder="No blank columns" options={Array.from({ length: 7 }, (_, index) => ({ value: String(index), label: index === 0 ? "None" : `${index} blank column${index === 1 ? "" : "s"}` }))} />
          <div><label htmlFor="preset-name" className="text-xs font-medium">Preset name</label><input id="preset-name" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="e.g. Parent contact list" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></div>
          <button type="button" onClick={savePreset} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-4 text-sm font-medium hover:bg-brand-soft"><Save className="size-4" aria-hidden="true" />Save preset</button>
        </div>
        {presets.length || recents.length ? <div className="mt-4 grid gap-4 border-t border-border-subtle pt-4 md:grid-cols-2">
          <div><h3 className="text-xs font-semibold">Saved presets</h3><div className="mt-2 flex flex-wrap gap-2">{presets.length ? presets.map((item) => <button key={item.id} type="button" onClick={() => applyStored(item)} className="rounded-[var(--radius-xs)] bg-brand-soft px-2.5 py-1.5 text-xs font-medium text-brand-strong">{item.name}</button>) : <span className="text-xs text-muted-foreground">No saved presets.</span>}</div></div>
          <div>
            <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold">Recent lists</h3>{recents.length ? <button type="button" onClick={clearRecents} className="text-xs font-medium text-muted-foreground hover:text-foreground">Clear</button> : null}</div>
            <div className="mt-2 flex flex-wrap gap-2">{recents.length ? recents.map((item) => <button key={item.id} type="button" onClick={() => applyStored(item)} className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs font-medium">{item.name}</button>) : <span className="text-xs text-muted-foreground">No recent lists.</span>}</div>
          </div>
        </div> : null}
        <button type="button" disabled={!configuration.rosterId || pending} onClick={() => preview()} className="scolapro-cta mt-4 inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? <Spinner className="size-4 text-white" /> : <Search className="size-4" aria-hidden="true" />}{pending ? "Preparing preview…" : "Preview"}</button>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]" aria-busy={pending}>
        <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><h2 className="scolapro-section-title">Preview · {data.title}</h2><p className="scolapro-section-description">{data.academicYear} · {data.grade} · {data.className} · {data.learners.length} learner{data.learners.length === 1 ? "" : "s"}{data.registerTeacherName ? ` · Register teacher: ${data.registerTeacherName}` : ""}</p></div>
          <ClassListDocumentActions baseHref={exportBase} />
        </div>
        {data.learners.length ? <div className="max-h-[60vh] w-full overflow-auto overscroll-contain">
          <table className="w-full min-w-[48rem] table-auto border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-muted">
              <tr>{previewColumns.map((column) => <th key={column.key} className={`whitespace-nowrap border border-border-subtle px-2.5 py-2 font-semibold ${column.key.startsWith("blank-") ? "min-w-28" : ""}`}>{column.label || "Blank"}</th>)}</tr>
            </thead>
            <tbody>{data.learners.map((learner, index) => <tr key={learner.learnerId} className="hover:bg-surface-muted/55">{previewColumns.map((column) => <td key={column.key} className={`whitespace-nowrap border border-border-subtle px-2.5 py-2 ${column.key === "learner" ? "font-medium" : "text-muted-foreground"} ${column.key.startsWith("blank-") ? "min-w-28" : ""}`}>{column.value(learner, index) || <span aria-label="Blank column">&nbsp;</span>}</td>)}</tr>)}</tbody>
          </table>
        </div> : <div className="px-5 py-12 text-center"><UsersRound className="mx-auto size-5 text-muted-foreground" /><h3 className="mt-2 text-sm font-semibold">No learners in this roster</h3><p className="mt-1 text-xs text-muted-foreground">Choose another active roster or verify its current memberships.</p></div>}
      </section>
    </div>
  );
}
