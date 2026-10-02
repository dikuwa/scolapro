"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, FileSearch, GitBranch, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { formFieldControlOffsetClass, formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import {
  registerCurriculumTimeSource,
  setCurriculumTimeSupersession,
  transitionCurriculumSource,
  transitionCurriculumTimeRule,
  type GovernanceActionState,
} from "@/features/platform/server/curriculum-time-governance-actions";
import type {
  CurriculumTimeGovernanceWorkspace,
  GovernanceAllocation,
  GovernanceConstraint,
  GovernanceProfile,
  GovernanceSource,
} from "@/features/platform/server/curriculum-time-governance";

const inputClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";
const conflictReadinessMessage = "Source conflict requires an explicit acknowledgement reason or supersession.";

const statusClass: Record<string, string> = {
  discovered: "bg-surface-muted text-muted-foreground",
  imported: "bg-[color:var(--info-soft)] text-[color:var(--info)]",
  draft: "bg-surface-muted text-muted-foreground",
  verified: "bg-success-soft text-[color:var(--success)]",
  published: "bg-brand-soft text-brand-strong",
  superseded: "bg-[color:var(--accent-amber-soft)] text-[color:var(--accent-amber)]",
  withdrawn: "bg-danger-soft text-[color:var(--danger)]",
};

function StateToast({ state }: { state: GovernanceActionState }) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
  return null;
}

function Status({ value }: { value: string }) {
  return <span className={"rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold capitalize " + (statusClass[value] ?? "bg-surface-muted text-muted-foreground")}>{value}</span>;
}

function Readiness({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-[color:var(--success)]"><CheckCircle2 className="size-3.5" /> Publication evidence ready.</p>;
  }
  return <ul className="mt-2 space-y-1 text-[0.68rem] leading-5 text-[color:var(--warning)]">{items.map((item) => <li key={item} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{item}</li>)}</ul>;
}

function JsonSummary({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  if (!entries.length) return <span className="text-muted-foreground">No provenance metadata</span>;
  const text = entries.slice(0, 3).map(([key, item]) => key + ": " + String(item)).join(" · ");
  return <span title={JSON.stringify(value)}>{text}{entries.length > 3 ? " …" : ""}</span>;
}

function SourceRegistration() {
  const [state, action, pending] = useActionState(registerCurriculumTimeSource, {} as GovernanceActionState);
  const [documentDate, setDocumentDate] = useState("");
  return (
    <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
      <StateToast state={state} />
      <h2 className="scolapro-section-title">Register official source</h2>
      <p className="scolapro-section-description">Registration does not publish policy. The source begins as imported and still requires human verification.</p>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><label className={formFieldLabelClass} htmlFor="source-authority">Authority</label><input id="source-authority" name="authority" defaultValue="NIED" required className={inputClass + " " + formFieldControlOffsetClass} /></div>
        <div><label className={formFieldLabelClass} htmlFor="source-key">Source key</label><input id="source-key" name="sourceKey" required placeholder="nied-national-curriculum-2016" className={inputClass + " " + formFieldControlOffsetClass} /></div>
        <div className="sm:col-span-2"><label className={formFieldLabelClass} htmlFor="source-title">Official title</label><input id="source-title" name="title" required className={inputClass + " " + formFieldControlOffsetClass} /></div>
        <div className="sm:col-span-2"><label className={formFieldLabelClass} htmlFor="source-url">Official source URL</label><input id="source-url" name="sourceUrl" type="url" required className={inputClass + " " + formFieldControlOffsetClass} /></div>
        <DateField label="Document date (optional)" name="sourceDocumentDate" value={documentDate} onChange={setDocumentDate} />
        <div><label className={formFieldLabelClass} htmlFor="source-checksum">Checksum</label><input id="source-checksum" name="checksum" required placeholder="sha256:…" className={inputClass + " " + formFieldControlOffsetClass} /></div>
        <div className="sm:col-span-2"><label className={formFieldLabelClass} htmlFor="source-provenance">Provenance JSON</label><textarea id="source-provenance" name="provenance" required rows={3} defaultValue={'{"retrievedFrom":"NIED","reviewNote":"Human reviewer must compare extracted rows to this source."}'} className={inputClass + " " + formFieldControlOffsetClass + " resize-y py-2.5 font-mono text-xs"} /></div>
        <div className="sm:col-span-2"><Button type="submit" loading={pending}>Register imported source</Button></div>
      </form>
    </section>
  );
}

function SourceReview({ source }: { source: GovernanceSource }) {
  const [state, action, pending] = useActionState(transitionCurriculumSource, {} as GovernanceActionState);
  const evidenceBlocked = source.readiness.some((item) => item.includes("URL") || item.includes("Checksum") || item.includes("provenance"));
  return (
    <article className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3.5">
      <StateToast state={state} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="scolapro-record-title">{source.title}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{source.authority} · {source.sourceKey}{source.sourceDocumentDate ? " · " + source.sourceDocumentDate : ""}</p></div>
        <Status value={source.status} />
      </div>
      <p className="mt-2 break-all text-[0.68rem] text-muted-foreground">{source.sourceUrl ?? "No source URL"}</p>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">Checksum: {source.checksum ?? "missing"}</p>
      <p className="mt-1 text-[0.68rem] text-muted-foreground"><JsonSummary value={source.provenance} /></p>
      <Readiness items={source.readiness} />
      <form action={action} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="sourceId" value={source.id} />
        {["discovered", "imported"].includes(source.status) ? <Button name="action" value="verify" type="submit" size="sm" variant="success" loading={pending} disabled={evidenceBlocked}>Verify source</Button> : null}
        {!["withdrawn", "superseded"].includes(source.status) ? <Button name="action" value="withdraw" type="submit" size="sm" variant="danger" loading={pending}>Withdraw</Button> : null}
      </form>
    </article>
  );
}

function RuleLifecycle({
  entityType,
  id,
  status,
  readiness,
  conflictCount = 0,
}: {
  entityType: "profile" | "allocation" | "constraint";
  id: string;
  status: string;
  readiness: string[];
  conflictCount?: number;
}) {
  const [state, action, pending] = useActionState(transitionCurriculumTimeRule, {} as GovernanceActionState);
  const publishBlocked = readiness.some(
    (item) => !item.includes("human-verified")
      && !item.includes("must be human-verified")
      && item !== conflictReadinessMessage,
  );
  return (
    <div className="mt-3">
      <StateToast state={state} />
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={id} />
        {status === "draft" ? <Button type="submit" name="action" value="verify" size="sm" variant="success" loading={pending}>Human verify</Button> : null}
        {status === "verified" ? (
          <>
            {entityType === "allocation" && conflictCount > 0 ? <div className="min-w-[14rem] flex-1"><label className={formFieldLabelClass} htmlFor={"conflict-" + id}>Conflict acknowledgement</label><input id={"conflict-" + id} name="conflictReason" required minLength={4} maxLength={1000} placeholder="Required when the overlap is intentional" className={inputClass + " " + formFieldControlOffsetClass} /></div> : null}
            <Button type="submit" name="action" value="publish" size="sm" loading={pending} disabled={publishBlocked}>Publish</Button>
            <Button type="submit" name="action" value="return_to_draft" size="sm" variant="neutral" loading={pending}>Return to draft</Button>
          </>
        ) : null}
        {status === "published" ? <><Button type="submit" name="action" value="supersede" size="sm" variant="soft" loading={pending}>Mark superseded</Button><Button type="submit" name="action" value="withdraw" size="sm" variant="danger" loading={pending}>Withdraw</Button></> : null}
        {status === "superseded" ? <Button type="submit" name="action" value="withdraw" size="sm" variant="danger" loading={pending}>Withdraw</Button> : null}
      </form>
    </div>
  );
}

function SupersessionContext({
  currentId,
  options,
}: {
  currentId: string | null;
  options: { value: string; label: string; helper?: string }[];
}) {
  if (!currentId) return null;
  const predecessor = options.find((option) => option.value === currentId);
  return (
    <p className="mt-1 text-[0.68rem] text-muted-foreground">
      Supersedes: <strong className="font-semibold text-foreground">{predecessor?.label ?? currentId}</strong>
    </p>
  );
}

function SupersessionEditor({
  entityType,
  id,
  status,
  currentId,
  options,
}: {
  entityType: "profile" | "allocation" | "constraint";
  id: string;
  status: string;
  currentId: string | null;
  options: { value: string; label: string; helper?: string }[];
}) {
  const [value, setValue] = useState(currentId ?? "");
  const [state, action, pending] = useActionState(setCurriculumTimeSupersession, {} as GovernanceActionState);
  if (status !== "draft" || !options.length) return null;
  return (
    <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <StateToast state={state} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={id} />
      <Picker label="Explicit predecessor" name="predecessorId" value={value} onChange={setValue} placeholder="Choose the rule this draft supersedes" options={options.filter((option) => option.value !== id)} searchable />
      <Button type="submit" size="sm" variant="soft" loading={pending} disabled={!value}><GitBranch className="size-3.5" /> Save link</Button>
    </form>
  );
}

function ProfileReview({ profile, options }: { profile: GovernanceProfile; options: { value: string; label: string; helper?: string }[] }) {
  const yearRange = String(profile.effectiveFromYear) + "–" + String(profile.effectiveToYear ?? "open");
  return <article className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="scolapro-record-title">{profile.title}</p><p className="mt-0.5 break-words text-[0.68rem] text-muted-foreground">{profile.sourceAuthority} · {profile.sourceTitle}{profile.sourceDocumentDate ? " · " + profile.sourceDocumentDate : ""}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{profile.phaseCode ?? "all phases"} · {profile.cycleKind} {profile.cycleLength}-day · {yearRange}</p></div><Status value={profile.status} /></div><p className="mt-2 text-[0.68rem] text-muted-foreground">Period: {profile.periodMinutes ?? "—"} min · Total: {profile.totalPeriodsPerCycle ?? "—"} / cycle · Key: {profile.profileKey}</p><p className="mt-1 text-[0.68rem] text-muted-foreground"><JsonSummary value={profile.provenance} /></p><SupersessionContext currentId={profile.supersedesProfileId} options={options} /><Readiness items={profile.readiness} /><SupersessionEditor entityType="profile" id={profile.id} status={profile.status} currentId={profile.supersedesProfileId} options={options} /><RuleLifecycle entityType="profile" id={profile.id} status={profile.status} readiness={profile.readiness} /></article>;
}

function AllocationReview({ allocation, options }: { allocation: GovernanceAllocation; options: { value: string; label: string; helper?: string }[] }) {
  const gradeRange = String(allocation.gradeFrom ?? "all") + (allocation.gradeTo && allocation.gradeTo !== allocation.gradeFrom ? "–" + allocation.gradeTo : "");
  return <article className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="scolapro-record-title">{allocation.displayLabel}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{allocation.profileTitle} · {allocation.subjectName ?? allocation.targetKind.replaceAll("_", " ")} · Grade {gradeRange}</p></div><Status value={allocation.status} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-muted-foreground"><span><strong className="text-foreground">{allocation.periodsPerCycle}</strong> periods/cycle</span>{allocation.percentageTime ? <span>{allocation.percentageTime}%</span> : null}<span className="capitalize">{allocation.ruleStrength}</span>{allocation.conflictCount ? <span className="text-[color:var(--danger)]">{allocation.conflictCount} conflict{allocation.conflictCount === 1 ? "" : "s"}</span> : null}</div><p className="mt-2 text-[0.68rem] text-muted-foreground">Source locator: {allocation.sourceLocator ?? "missing"}</p>{allocation.conflictAcknowledgementReason ? <p className="mt-1 text-[0.68rem] text-muted-foreground">Conflict acknowledgement: {allocation.conflictAcknowledgementReason}</p> : null}<SupersessionContext currentId={allocation.supersedesAllocationId} options={options} /><Readiness items={allocation.readiness} /><SupersessionEditor entityType="allocation" id={allocation.id} status={allocation.status} currentId={allocation.supersedesAllocationId} options={options} /><RuleLifecycle entityType="allocation" id={allocation.id} status={allocation.status} readiness={allocation.readiness} conflictCount={allocation.conflictCount} /></article>;
}

function ConstraintReview({ constraint, options }: { constraint: GovernanceConstraint; options: { value: string; label: string; helper?: string }[] }) {
  const yearRange = String(constraint.effectiveFromYear) + "–" + String(constraint.effectiveToYear ?? "open");
  return <article className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="scolapro-record-title">{constraint.constraintType.replaceAll("_", " ")}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{constraint.subjectName ?? constraint.allocationLabel ?? "Subject-level constraint"} · {constraint.cycleKind ?? "cycle pending"} {constraint.cycleLength ?? "—"}-day · {yearRange}</p></div><Status value={constraint.status} /></div><p className="mt-2 text-[0.68rem] text-muted-foreground">Minimum: {constraint.numericValue ?? "—"} · <span className="capitalize">{constraint.ruleStrength}</span> · {constraint.sourceTitle}</p><p className="mt-1 text-[0.68rem] text-muted-foreground">Source locator: {constraint.sourceLocator}</p><SupersessionContext currentId={constraint.supersedesConstraintId} options={options} /><Readiness items={constraint.readiness} /><SupersessionEditor entityType="constraint" id={constraint.id} status={constraint.status} currentId={constraint.supersedesConstraintId} options={options} /><RuleLifecycle entityType="constraint" id={constraint.id} status={constraint.status} readiness={constraint.readiness} /></article>;
}

export function CurriculumTimeGovernance({ workspace }: { workspace: CurriculumTimeGovernanceWorkspace }) {
  const profileOptions = workspace.profiles.map((item) => ({ value: item.id, label: item.title, helper: item.cycleKind + " " + item.cycleLength + "-day · " + item.status }));
  const allocationOptions = workspace.allocations.map((item) => ({ value: item.id, label: item.displayLabel, helper: item.profileTitle + " · " + item.status }));
  const constraintOptions = workspace.constraints.map((item) => ({ value: item.id, label: item.constraintKey, helper: item.constraintType.replaceAll("_", " ") + " · " + item.status }));
  const stats: Array<[string, number, string]> = [
    ["Sources", workspace.summary.sources, String(workspace.summary.verifiedSources) + " verified"],
    ["Profiles", workspace.summary.profiles, String(workspace.summary.publishedProfiles) + " published"],
    ["Allocations", workspace.summary.allocations, String(workspace.summary.publishedAllocations) + " published"],
    ["Constraints", workspace.summary.constraints, String(workspace.summary.publishedConstraints) + " published"],
    ["Conflicts", workspace.summary.unresolvedConflicts, "unresolved"],
  ];

  return <div className="space-y-5">
    <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-5">{stats.map(([label, value, helper], index) => <div key={label} className={"px-4 py-4 " + (index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : "")}><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-brand-strong">{value}</p><p className="mt-0.5 text-[0.64rem] text-muted-foreground">{helper}</p></div>)}</section>

    {workspace.summary.unresolvedConflicts ? <section className="rounded-[var(--radius-md)] bg-danger-soft p-4 text-[color:var(--danger)] shadow-[var(--shadow-xs)] sm:p-5"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><h2 className="scolapro-section-title !text-current">Source conflicts</h2><p className="scolapro-section-description !text-current/80">Unresolved overlaps block automatic default selection. Resolve with explicit supersession or record why an intentional conflict may publish.</p></div></div><div className="mt-3 divide-y divide-[color:var(--danger)]/15">{workspace.conflicts.filter((item) => !item.acknowledged).map((item) => <div key={item.leftAllocationId + ":" + item.rightAllocationId} className="py-2.5 text-xs"><strong>{item.leftLabel}</strong> ↔ <strong>{item.rightLabel}</strong><p className="mt-0.5 opacity-80">{item.target} · {item.profileScope}</p></div>)}</div></section> : null}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)] xl:items-start">
      <div className="space-y-5">
        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="mb-4 flex items-start gap-2.5 border-b border-border-subtle pb-4"><span className="scolapro-tone-brand grid size-8 place-items-center rounded-[var(--radius-sm)]"><FileSearch className="size-4" /></span><div><h2 className="scolapro-section-title">Official sources</h2><p className="scolapro-section-description !mt-0">Withdrawn evidence remains visible to Platform Administrators for historical reconstruction.</p></div></div>{workspace.sources.length ? <div className="grid gap-3 lg:grid-cols-2">{workspace.sources.map((source) => <SourceReview key={source.id} source={source} />)}</div> : <p className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-sm text-muted-foreground">No official curriculum sources are registered.</p>}</section>

        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="mb-4 flex items-start gap-2.5 border-b border-border-subtle pb-4"><span className="scolapro-tone-mint grid size-8 place-items-center rounded-[var(--radius-sm)]"><ShieldCheck className="size-4" /></span><div><h2 className="scolapro-section-title">Time allocation profiles</h2><p className="scolapro-section-description !mt-0">Exact cycle variants are reviewed independently. No automatic 5-day ↔ 7-day conversion occurs.</p></div></div>{workspace.profiles.length ? <div className="grid gap-3 lg:grid-cols-2">{workspace.profiles.map((profile) => <ProfileReview key={profile.id} profile={profile} options={profileOptions} />)}</div> : <p className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-sm text-muted-foreground">No staged time-allocation profiles yet.</p>}</section>

        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="mb-4 flex items-start gap-2.5 border-b border-border-subtle pb-4"><span className="scolapro-tone-sky grid size-8 place-items-center rounded-[var(--radius-sm)]"><FileCheck2 className="size-4" /></span><div><h2 className="scolapro-section-title">Allocation review</h2><p className="scolapro-section-description !mt-0">Every row keeps the official value, source locator, rule strength and explicit supersession provenance visible.</p></div></div>{workspace.allocations.length ? <div className="grid gap-3 lg:grid-cols-2">{workspace.allocations.map((allocation) => <AllocationReview key={allocation.id} allocation={allocation} options={allocationOptions} />)}</div> : <p className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-sm text-muted-foreground">No staged allocation rows yet.</p>}</section>

        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="mb-4 flex items-start gap-2.5 border-b border-border-subtle pb-4"><span className="scolapro-tone-amber grid size-8 place-items-center rounded-[var(--radius-sm)]"><GitBranch className="size-4" /></span><div><h2 className="scolapro-section-title">Scheduling constraints</h2><p className="scolapro-section-description !mt-0">Constraint publication remains source-backed, exact-cycle and independently verifiable.</p></div></div>{workspace.constraints.length ? <div className="grid gap-3 lg:grid-cols-2">{workspace.constraints.map((constraint) => <ConstraintReview key={constraint.id} constraint={constraint} options={constraintOptions} />)}</div> : <p className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-sm text-muted-foreground">No staged scheduling constraints yet.</p>}</section>
      </div>

      <div className="space-y-5">
        <SourceRegistration />
        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><h2 className="scolapro-section-title">Publication safeguards</h2><p className="scolapro-section-description">Database guards—not only this screen—enforce the finality boundary.</p><ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground"><li>• Source must be verified with URL, checksum and non-empty provenance.</li><li>• Profiles, allocations and constraints must pass human verification before publish.</li><li>• Allocation publication requires a source locator and a published parent profile.</li><li>• Overlapping official rules require explicit supersession or a recorded conflict acknowledgement.</li><li>• Published content and verification provenance become immutable.</li><li>• AI/extraction output remains draft until a human reviewer explicitly verifies it.</li></ul></section>
      </div>
    </div>
  </div>;
}
