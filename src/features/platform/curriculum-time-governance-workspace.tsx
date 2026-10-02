"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, Link2, ShieldCheck } from "lucide-react";
import { applyCurriculumTimeGovernanceAction, type CurriculumGovernanceActionState } from "@/features/platform/server/curriculum-time-governance-actions";
import type {
  CurriculumTimeGovernanceWorkspace as Workspace,
  GovernanceAllocation,
  GovernanceConstraint,
  GovernanceProfile,
} from "@/features/platform/server/curriculum-time-governance";

const initialState: CurriculumGovernanceActionState = {};

function statusClass(status: string) {
  if (status === "published" || status === "verified") return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (status === "withdrawn" || status === "superseded") return "bg-surface-muted text-muted-foreground";
  return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
}

function Status({ value }: { value: string }) {
  return <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold capitalize ${statusClass(value)}`}>{value}</span>;
}

function ActionForm({
  entityType,
  entityId,
  action,
  label,
  relatedId,
  tone = "brand",
}: {
  entityType: "source" | "profile" | "allocation" | "constraint";
  entityId: string;
  action: "verify" | "publish" | "withdraw" | "link_supersession";
  label: string;
  relatedId?: string;
  tone?: "brand" | "danger" | "neutral";
}) {
  const [state, formAction, pending] = useActionState(applyCurriculumTimeGovernanceAction, initialState);
  const classes = tone === "danger"
    ? "bg-danger-soft text-[color:var(--danger)]"
    : tone === "neutral"
      ? "bg-surface-muted text-foreground"
      : "bg-brand text-white";
  return (
    <div className="min-w-0">
      <form action={formAction}>
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="action" value={action} />
        <input type="hidden" name="relatedId" value={relatedId ?? ""} />
        <button type="submit" disabled={pending} className={`min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem] font-semibold disabled:opacity-50 ${classes}`}>
          {pending ? "Working…" : label}
        </button>
      </form>
      {state.message ? <p className={`mt-1 max-w-60 text-[0.62rem] ${state.success ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"}`}>{state.message}</p> : null}
    </div>
  );
}

function ConflictForm({
  keepId,
  withdrawId,
  label,
}: {
  keepId: string;
  withdrawId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(applyCurriculumTimeGovernanceAction, initialState);
  return (
    <form action={formAction} className="min-w-0 rounded-[var(--radius-sm)] bg-surface-muted p-3">
      <input type="hidden" name="entityType" value="allocation" />
      <input type="hidden" name="entityId" value={keepId} />
      <input type="hidden" name="relatedId" value={withdrawId} />
      <input type="hidden" name="action" value="resolve_conflict" />
      <label className="block text-[0.68rem] font-medium text-muted-foreground">
        Resolution reason
        <input name="reason" required maxLength={1000} className="mt-1 min-h-9 w-full rounded-[var(--radius-xs)] border border-border bg-surface-elevated px-2.5 text-sm text-foreground outline-none focus:border-brand" placeholder="Record the verified policy reason…" />
      </label>
      <button type="submit" disabled={pending} className="mt-2 min-h-8 rounded-[var(--radius-xs)] bg-[color:var(--danger-soft)] px-2.5 text-[0.68rem] font-semibold text-[color:var(--danger)] disabled:opacity-50">
        {pending ? "Resolving…" : label}
      </button>
      {state.message ? <p className={`mt-1 text-[0.62rem] ${state.success ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"}`}>{state.message}</p> : null}
    </form>
  );
}

function years(from: number, to: number | null) {
  return to && to !== from ? `${from}–${to}` : String(from);
}

function grades(from: number | null, to: number | null) {
  if (from === null && to === null) return "All grades";
  if (from === to) return `Grade ${from}`;
  return `Grades ${from ?? "…"}–${to ?? "…"}`;
}

function profileCandidates(profile: GovernanceProfile, profiles: GovernanceProfile[]) {
  return profiles.filter((candidate) =>
    candidate.id !== profile.id &&
    ["published","superseded"].includes(candidate.status) &&
    candidate.phaseCode === profile.phaseCode &&
    candidate.cycleKind === profile.cycleKind &&
    candidate.cycleLength === profile.cycleLength
  );
}

function allocationCandidates(allocation: GovernanceAllocation, allocations: GovernanceAllocation[]) {
  return allocations.filter((candidate) => {
    if (candidate.id === allocation.id || !["published","superseded"].includes(candidate.status)) return false;
    if (allocation.targetKind === "subject") return candidate.targetKind === "subject" && candidate.curriculumSubjectId === allocation.curriculumSubjectId;
    return candidate.targetKind === allocation.targetKind && candidate.allocationKey === allocation.allocationKey;
  });
}

function constraintCandidates(constraint: GovernanceConstraint, constraints: GovernanceConstraint[]) {
  return constraints.filter((candidate) =>
    candidate.id !== constraint.id &&
    ["published","superseded"].includes(candidate.status) &&
    candidate.constraintType === constraint.constraintType &&
    candidate.allocationId === constraint.allocationId &&
    candidate.curriculumSubjectId === constraint.curriculumSubjectId &&
    candidate.cycleKind === constraint.cycleKind &&
    candidate.cycleLength === constraint.cycleLength
  );
}

export function CurriculumTimeGovernanceWorkspace({ workspace }: { workspace: Workspace }) {
  const publishedProfiles = workspace.profiles.filter((item) => item.status === "published").length;
  const publishedAllocations = workspace.allocations.filter((item) => item.status === "published").length;
  const verifiedSources = workspace.sources.filter((item) => item.status === "verified").length;

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Verified sources", verifiedSources],
          ["Published profiles", publishedProfiles],
          ["Published allocations", publishedAllocations],
          ["Constraints", workspace.constraints.length],
          ["Source conflicts", workspace.conflicts.length],
        ].map(([label,value],index) => (
          <div key={String(label)} className={`px-4 py-4 sm:px-5 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""}`}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[color:var(--warning-soft)] p-4 text-[color:var(--warning)]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">Publication safeguards</h2>
          <p className="mt-1 text-xs leading-5">A profile cannot publish until its source evidence, profile provenance and contained allocation/constraint review are complete. AI-assisted extraction remains staged; human verification is mandatory.</p>
        </div>
      </section>

      {workspace.conflicts.length ? (
        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="mb-4 flex items-start gap-2 border-b border-border-subtle pb-4">
            <span className="scolapro-tone-amber grid size-8 place-items-center rounded-[var(--radius-sm)]"><AlertTriangle className="size-4" aria-hidden="true" /></span>
            <div><h2 className="scolapro-section-title">Source conflicts</h2><p className="scolapro-section-description !mt-0">Published conflicts require a documented human decision. They are policy conflicts, not system errors.</p></div>
          </div>
          <div className="divide-y divide-border-subtle">
            {workspace.conflicts.map((conflict) => (
              <article key={`${conflict.allocationAId}:${conflict.allocationBId}`} className="py-4 first:pt-0 last:pb-0">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                  <div><p className="font-semibold">{conflict.allocationALabel}</p><p className="mt-1 text-xs text-muted-foreground">{conflict.sourceATitle}</p></div>
                  <span className="text-xs font-semibold text-[color:var(--warning)]">conflicts with</span>
                  <div><p className="font-semibold">{conflict.allocationBLabel}</p><p className="mt-1 text-xs text-muted-foreground">{conflict.sourceBTitle}</p></div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{grades(conflict.gradeFrom,conflict.gradeTo)} · {conflict.cycleLength}-day {conflict.cycleKind.replaceAll("_"," ")} · {years(conflict.effectiveFromYear,conflict.effectiveToYear)}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <ConflictForm keepId={conflict.allocationAId} withdrawId={conflict.allocationBId} label={`Keep ${conflict.allocationALabel}`} />
                  <ConflictForm keepId={conflict.allocationBId} withdrawId={conflict.allocationAId} label={`Keep ${conflict.allocationBLabel}`} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-4"><span className="scolapro-tone-sky grid size-8 place-items-center rounded-[var(--radius-sm)]"><FileCheck2 className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Official sources</h2><p className="scolapro-section-description !mt-0">Source evidence must include URL, checksum and provenance before verification.</p></div></div>
        {workspace.sources.length ? <div className="divide-y divide-border-subtle">{workspace.sources.map((source) => {
          const ready = Boolean(source.sourceUrl && source.checksum && Object.keys(source.provenance).length);
          return <article key={source.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{source.title}</p><Status value={source.status} /></div><p className="mt-1 text-xs text-muted-foreground">{source.authority}{source.sourceDocumentDate ? ` · ${source.sourceDocumentDate}` : ""}</p><p className="mt-1 break-all text-[0.68rem] text-muted-foreground">Checksum: {source.checksum ?? "Missing"}</p>{source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block max-w-full truncate text-xs font-medium text-brand hover:underline">{source.sourceUrl}</a> : <p className="mt-1 text-xs text-[color:var(--danger)]">Source URL missing</p>}</div><div className="shrink-0">{source.status !== "verified" ? ready ? <ActionForm entityType="source" entityId={source.id} action="verify" label="Verify source" /> : <span className="rounded-[var(--radius-xs)] bg-danger-soft px-2 py-1 text-[0.64rem] font-semibold text-[color:var(--danger)]">Evidence incomplete</span> : null}</div></article>;
        })}</div> : <p className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center text-sm text-muted-foreground">No official sources registered.</p>}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4"><h2 className="scolapro-section-title">Time allocation profiles</h2><p className="scolapro-section-description">Cycle/effective-year containers must be verified before publication. Supersession is explicit and linked while the successor is draft.</p></div>
        <div className="divide-y divide-border-subtle">{workspace.profiles.map((profile) => {
          const candidates = profile.status === "draft" && !profile.supersedesProfileId ? profileCandidates(profile,workspace.profiles).slice(0,3) : [];
          return <article key={profile.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{profile.title}</p><Status value={profile.status} /></div><p className="mt-1 text-xs text-muted-foreground">{profile.sourceTitle} · {profile.cycleLength}-day {profile.cycleKind.replaceAll("_"," ")} · {years(profile.effectiveFromYear,profile.effectiveToYear)}</p><p className="mt-1 text-xs text-muted-foreground">{profile.phaseCode ?? "All phases"} · {profile.periodMinutes ? `${profile.periodMinutes} min periods` : "Period duration not specified"} · {profile.totalPeriodsPerCycle ?? "—"} total periods/cycle</p><p className="mt-1 text-[0.68rem] text-muted-foreground">Provenance: {Object.keys(profile.provenance).length ? "recorded" : "missing"}{profile.supersedesProfileId ? ` · Supersedes ${profile.supersedesProfileId}` : ""}</p></div><div className="flex flex-wrap gap-2">{profile.status==="draft"?<ActionForm entityType="profile" entityId={profile.id} action="verify" label="Verify profile" />:null}{profile.status==="verified"?<ActionForm entityType="profile" entityId={profile.id} action="publish" label="Publish profile" />:null}{["published","superseded"].includes(profile.status)?<ActionForm entityType="profile" entityId={profile.id} action="withdraw" label="Withdraw" tone="danger" />:null}</div></div>{candidates.length?<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[0.68rem] font-medium text-muted-foreground">Explicit supersession:</span>{candidates.map((candidate)=><ActionForm key={candidate.id} entityType="profile" entityId={profile.id} action="link_supersession" relatedId={candidate.id} label={`Supersede ${candidate.title}`} tone="neutral" />)}</div>:null}</article>;
        })}</div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4"><h2 className="scolapro-section-title">Allocation review</h2><p className="scolapro-section-description">Review canonical target, grade scope, periods, source locator, rule strength and supersession before publication.</p></div>
        <div className="divide-y divide-border-subtle">{workspace.allocations.map((allocation) => {
          const candidates = allocation.status === "draft" && !allocation.supersedesAllocationId ? allocationCandidates(allocation,workspace.allocations).slice(0,3) : [];
          return <article key={allocation.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{allocation.displayLabel}</p><Status value={allocation.status} /></div><p className="mt-1 text-xs text-muted-foreground">{allocation.curriculumSubjectLabel ?? allocation.allocationKey} · {grades(allocation.gradeFrom,allocation.gradeTo)} · {allocation.periodsPerCycle} periods/cycle{allocation.percentageTime ? ` · ${allocation.percentageTime}%` : ""}</p><p className="mt-1 text-xs text-muted-foreground">Rule: {allocation.ruleStrength} · Locator: {allocation.sourceLocator ?? "Missing"}{allocation.supersedesAllocationId ? ` · Supersedes ${allocation.supersedesAllocationId}` : ""}</p></div><div className="flex flex-wrap gap-2">{allocation.status==="draft"?<ActionForm entityType="allocation" entityId={allocation.id} action="verify" label="Verify allocation" />:null}{allocation.status==="verified"?<ActionForm entityType="allocation" entityId={allocation.id} action="publish" label="Publish allocation" />:null}{["published","superseded"].includes(allocation.status)?<ActionForm entityType="allocation" entityId={allocation.id} action="withdraw" label="Withdraw" tone="danger" />:null}</div></div>{candidates.length?<div className="mt-3 flex flex-wrap items-center gap-2"><Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />{candidates.map((candidate)=><ActionForm key={candidate.id} entityType="allocation" entityId={allocation.id} action="link_supersession" relatedId={candidate.id} label={`Supersede ${candidate.displayLabel}`} tone="neutral" />)}</div>:null}</article>;
        })}</div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="mb-4 flex items-center gap-2"><span className="scolapro-tone-mint grid size-8 place-items-center rounded-[var(--radius-sm)]"><CheckCircle2 className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Scheduling constraints</h2><p className="scolapro-section-description !mt-0">Only source-backed supported constraints may publish.</p></div></div>
        <div className="divide-y divide-border-subtle">{workspace.constraints.map((constraint) => {
          const candidates = constraint.status === "draft" && !constraint.supersedesConstraintId ? constraintCandidates(constraint,workspace.constraints).slice(0,3) : [];
          return <article key={constraint.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{constraint.constraintType.replaceAll("_"," ")}</p><Status value={constraint.status} /></div><p className="mt-1 text-xs text-muted-foreground">{grades(constraint.gradeFrom,constraint.gradeTo)} · {constraint.cycleLength ? `${constraint.cycleLength}-day ${constraint.cycleKind?.replaceAll("_"," ") ?? "cycle"}` : "Cycle inherited"} · {constraint.numericValue ?? "—"} · {constraint.ruleStrength}</p><p className="mt-1 text-xs text-muted-foreground">Locator: {constraint.sourceLocator} · {years(constraint.effectiveFromYear,constraint.effectiveToYear)}</p></div><div className="flex flex-wrap gap-2">{constraint.status==="draft"?<ActionForm entityType="constraint" entityId={constraint.id} action="verify" label="Verify constraint" />:null}{constraint.status==="verified"?<ActionForm entityType="constraint" entityId={constraint.id} action="publish" label="Publish constraint" />:null}{["published","superseded"].includes(constraint.status)?<ActionForm entityType="constraint" entityId={constraint.id} action="withdraw" label="Withdraw" tone="danger" />:null}</div></div>{candidates.length?<div className="mt-3 flex flex-wrap gap-2">{candidates.map((candidate)=><ActionForm key={candidate.id} entityType="constraint" entityId={constraint.id} action="link_supersession" relatedId={candidate.id} label="Link predecessor" tone="neutral" />)}</div>:null}</article>;
        })}</div>
      </section>
    </div>
  );
}
