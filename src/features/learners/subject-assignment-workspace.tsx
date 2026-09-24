"use client";

import { AlertTriangle, Check, RefreshCcw, Search, UsersRound } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import {
  applyLearnerSubjectBulkAssignment,
  previewLearnerSubjectBulkAssignment,
} from "@/features/learners/server/subject-assignment-actions";
import type {
  SubjectAssignmentOffering,
  SubjectAssignmentPreview,
  SubjectAssignmentScopeType,
  SubjectAssignmentWorkspaceData,
} from "@/features/learners/subject-assignment-types";

const scopeTypeOptions = [
  { value: "grade", label: "Grade", helper: "All current learners in a grade" },
  { value: "register_class", label: "Register class", helper: "One current register class" },
  { value: "field_group", label: "Field / academic group", helper: "Learners in an existing subject-registration group" },
];

function SubjectToggle({ offering, selected, onToggle }: { offering: SubjectAssignmentOffering; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={selected} onClick={onToggle}
      className="flex min-h-12 w-full items-start gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2.5 text-left transition duration-[var(--motion-fast)] hover:border-border focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]">
      <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[var(--radius-xs)] border ${selected ? "border-[color:var(--brand)] bg-brand text-white" : "border-border bg-surface"}`}>
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <span className="min-w-0"><span className="block truncate text-sm font-medium">{offering.subjectName}</span><span className="mt-0.5 block text-xs text-muted-foreground">{offering.subjectCode}</span></span>
    </button>
  );
}

function PreviewMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "bg-success-soft text-[color:var(--success)]" : tone === "warning" ? "bg-warning-soft text-[color:var(--warning)]" : tone === "danger" ? "bg-danger-soft text-[color:var(--danger)]" : "bg-surface-muted text-foreground";
  return <div className={`rounded-[var(--radius-sm)] p-3 ${toneClass}`}><span className="block text-lg font-semibold">{value}</span><span className="mt-0.5 block text-xs font-medium">{label}</span></div>;
}

export function SubjectAssignmentWorkspace({ data }: { data: SubjectAssignmentWorkspaceData }) {
  const [scopeType, setScopeType] = useState<SubjectAssignmentScopeType>("grade");
  const [scopeId, setScopeId] = useState(data.scopes.grade[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<SubjectAssignmentPreview | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [applyPending, startApply] = useTransition();
  const scopes = data.scopes[scopeType];
  const selectedScope = scopes.find((scope) => scope.id === scopeId) ?? null;
  const offerings = useMemo(() => data.offerings.filter((offering) => offering.gradeId === selectedScope?.gradeId && offering.status === "active"), [data.offerings, selectedScope]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOfferings = normalizedQuery ? offerings.filter((offering) => `${offering.subjectName} ${offering.subjectCode}`.toLocaleLowerCase().includes(normalizedQuery)) : offerings;

  function invalidatePreview() { setPreview(null); }
  function changeScopeType(value: string) {
    const next = value as SubjectAssignmentScopeType;
    setScopeType(next); setScopeId(data.scopes[next][0]?.id ?? ""); setSelectedIds([]); invalidatePreview();
  }
  function changeScope(value: string) { setScopeId(value); setSelectedIds([]); invalidatePreview(); }
  function toggleOffering(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    invalidatePreview();
  }
  function requestPreview() {
    if (!scopeId) { toast.error("Choose a learner scope first."); return; }
    startPreview(async () => {
      const result = await previewLearnerSubjectBulkAssignment({ academicYear: data.academicYear, scopeType, scopeId, subjectOfferingIds: selectedIds });
      if (!result.success || !result.preview) { toast.error(result.message); return; }
      setPreview(result.preview); toast.success(result.message);
    });
  }
  function applyPreview() {
    if (!preview) return;
    startApply(async () => {
      const result = await applyLearnerSubjectBulkAssignment({ academicYear: data.academicYear, scopeType, scopeId, subjectOfferingIds: selectedIds, previewFingerprint: preview.preview_fingerprint });
      if (!result.success) { setPreview(null); toast.error(result.message); return; }
      if (result.preview) setPreview(result.preview);
      toast.success(result.message);
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3 border-b border-border-subtle pb-4"><span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Choose learner scope</h2><p className="scolapro-section-description !mt-0">Assignments are limited to current learners in the selected {data.academicYear} school scope.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Picker label="Scope type" value={scopeType} onChange={changeScopeType} placeholder="Choose scope type" options={scopeTypeOptions} />
          <Picker label="Scope" value={scopeId} onChange={changeScope} placeholder="Choose learner scope" searchable searchPlaceholder="Search grades, classes or groups" options={scopes.map((scope) => ({ value: scope.id, label: scope.label, helper: scope.helper }))} />
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="scolapro-section-title">Choose complete subject set</h2><p className="scolapro-section-description">Selected subjects will be active for every learner in scope. Existing active subjects not selected will be withdrawn, never deleted.</p></div><span className="w-fit rounded-[var(--radius-xs)] bg-brand-soft px-2.5 py-1.5 text-xs font-semibold text-brand-strong">{selectedIds.length} selected</span></div>
        <label className="relative mt-4 block"><span className="sr-only">Search subjects</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subjects by name or code" className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
        {visibleOfferings.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{visibleOfferings.map((offering) => <SubjectToggle key={offering.id} offering={offering} selected={selectedIds.includes(offering.id)} onToggle={() => toggleOffering(offering.id)} />)}</div> : <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No active subjects available</p><p className="mt-1 text-xs text-muted-foreground">Check the selected scope or subject configuration.</p></div>}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4"><Button loading={previewPending} disabled={!scopeId} onClick={requestPreview}><RefreshCcw className="size-4" aria-hidden="true" />{previewPending ? "Preparing preview…" : "Preview changes"}</Button><p className="text-xs text-muted-foreground">An empty selection previews withdrawal of every current subject in the scope.</p></div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5" aria-live="polite">
        <div><h2 className="scolapro-section-title">Review before apply</h2><p className="scolapro-section-description">No bulk change is committed until this preview is current and explicitly applied.</p></div>
        {!preview ? <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No current preview</p><p className="mt-1 text-xs text-muted-foreground">Choose the scope and complete subject set, then preview the exact impact.</p></div> : <div className="mt-4 space-y-4">
          <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-xs font-semibold">Scope being applied</p><p className="mt-1 text-sm">{preview.scope.label} · {preview.scope.grade_label} · {data.academicYear}</p><p className="mt-1 text-xs text-muted-foreground">{preview.affected_learner_count} learner{preview.affected_learner_count === 1 ? "" : "s"} · {preview.affected_subject_count} affected subject{preview.affected_subject_count === 1 ? "" : "s"}</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"><PreviewMetric label="Additions" value={preview.addition_count} tone="success" /><PreviewMetric label="Reactivations" value={preview.reactivation_count} tone="success" /><PreviewMetric label="Unchanged" value={preview.unchanged_count} /><PreviewMetric label="Withdrawals" value={preview.withdrawal_count} tone="warning" /><PreviewMetric label="Conflicts" value={preview.conflict_count} tone={preview.conflict_count ? "danger" : "neutral"} /></div>
          {preview.conflicts.length ? <div className="rounded-[var(--radius-sm)] bg-danger-soft p-3 text-[color:var(--danger)]"><div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4" />Resolve conflicts</div><ul className="mt-2 space-y-1 text-xs">{preview.conflicts.map((conflict) => <li key={`${conflict.subject_offering_id}-${conflict.code}`}>{conflict.message}</li>)}</ul></div> : null}
          {preview.affected_learner_count === 0 ? <div className="rounded-[var(--radius-sm)] bg-warning-soft p-3 text-xs text-[color:var(--warning)]">This scope currently contains no eligible learners. Apply is disabled.</div> : null}
          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4"><Button loading={applyPending} disabled={preview.conflict_count > 0 || preview.affected_learner_count === 0} onClick={applyPreview}><Check className="size-4" aria-hidden="true" />{applyPending ? "Applying…" : "Apply reviewed changes"}</Button><p className="text-xs text-muted-foreground">Apply uses this exact preview fingerprint and stops if learner or registration state has changed.</p></div>
        </div>}
      </section>
    </div>
  );
}
