"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole, Send, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import {
  approveProgression,
  generateProgression,
  lockProgression,
  overrideProgression,
  publishProgression,
  type ProgressionActionState,
} from "@/features/progression/server/actions";
import type { ProgressionLearner, ProgressionWorkspace } from "@/features/progression/server/workspace";

const initialState: ProgressionActionState = {};
const outcomeOptions = [
  { value: "promoted", label: "Promoted" },
  { value: "not_promoted", label: "Not promoted / repeat" },
  { value: "condoned", label: "Condoned" },
];

function outcomeLabel(value: string) {
  return value.replaceAll("_", " ");
}

function StatusChip({ status }: { status: string | null }) {
  if (!status) return <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.64rem] font-medium text-muted-foreground">Not started</span>;
  const tone = status === "locked" ? "bg-success-soft text-[color:var(--success)]" : status === "approved" ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground";
  return <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-medium capitalize ${tone}`}>{status}</span>;
}

export function ProgressionWorkspace({ workspace, canApprove, today }: { workspace: ProgressionWorkspace; canApprove: boolean; today: string }) {
  const router = useRouter();
  const [generateState, generateAction, generatePending] = useActionState(generateProgression, initialState);
  const [overrideState, overrideAction, overridePending] = useActionState(overrideProgression, initialState);
  const [approveState, approveAction, approvePending] = useActionState(approveProgression, initialState);
  const [lockState, lockAction, lockPending] = useActionState(lockProgression, initialState);
  const [publishState, publishAction, publishPending] = useActionState(publishProgression, initialState);

  useEffect(() => {
    let changed = false;
    for (const state of [generateState, overrideState, approveState, lockState, publishState]) {
      if (!state.message) continue;
      if (state.success) {
        toast.success(state.message);
        changed = true;
      } else toast.error(state.message);
    }
    // Each decision changes the rendered row and may open the next step, so the
    // server-rendered workspace must be re-read after a successful action.
    if (changed) router.refresh();
  }, [generateState, overrideState, approveState, lockState, publishState, router]);

  const { counts } = workspace;
  const metrics = [
    { label: "Current learners", value: counts.learners },
    { label: "Not started", value: counts.notStarted },
    { label: "Awaiting approval", value: counts.reviewed },
    { label: "Approved", value: counts.approved },
    { label: "Locked", value: counts.locked },
    { label: "Published", value: counts.published },
  ];

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="scolapro-page-title text-xl">Year-end progression</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review the governed promotion recommendation, record a reasoned override, approve and lock the decision, then publish the rollover into {workspace.nextAcademicYear}. Historical enrolments are preserved; nothing is hardcoded by grade or year.</p>
      </div>
      <div className="w-full sm:w-64">
        <Picker label="Grade" value={workspace.selectedGradeId ?? ""} onChange={(gradeId) => router.push(gradeId ? `/school/progression?grade=${gradeId}` : "/school/progression")}
          options={workspace.grades.map((grade) => ({ value: grade.id, label: grade.label }))} placeholder="Choose grade" searchable disabled={!workspace.grades.length} />
      </div>
    </div>

    {!workspace.nextYearConfigured ? <div role="status" className="rounded-[var(--radius-sm)] bg-warning-soft p-3 text-xs font-medium text-[color:var(--warning)]">
      The {workspace.nextAcademicYear} academic year is not configured. Publishing is blocked until the next year, its grades and register classes exist.
    </div> : null}
    {workspace.readinessFailed ? <div role="status" className="rounded-[var(--radius-sm)] bg-warning-soft p-3 text-xs font-medium text-[color:var(--warning)]">
      Recommendations could not be evaluated for this grade. Check that each active promotion rule version has every condition fully configured. Learner decisions and actions remain available.
    </div> : null}
    {counts.missingRuleSet ? <div role="status" className="rounded-[var(--radius-sm)] bg-surface-muted p-3 text-xs text-muted-foreground">
      {counts.missingRuleSet} learner{counts.missingRuleSet === 1 ? "" : "s"} have no active promotion rule set for their grade. Configure one in Academic setup before generating recommendations.
    </div> : null}

    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5" role="region" aria-label="Progression summary">
      <h2 className="scolapro-section-title">Progress summary</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => <div key={metric.label} className="rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2.5">
          <p className="text-[0.68rem] text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{metric.value}</p>
        </div>)}
      </div>
      <p className="mt-3 text-[0.68rem] leading-5 text-muted-foreground">Recommendations come from the canonical promotion engine and the active rule set for each grade. Application code does not compute pass, repetition or condonation thresholds.</p>
    </section>

    {workspace.publications.length ? <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]" role="region" aria-label="Published rollovers">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
        <h2 className="scolapro-section-title">Published rollovers</h2>
        <p className="scolapro-section-description">Append-only receipts of decisions rolled into the next academic year. The source enrolment is closed; the receipt remains authoritative.</p>
      </div>
      <div className="divide-y divide-border-subtle">
        {workspace.publications.map((receipt) => <div key={receipt.id} data-testid={`progression-receipt-${receipt.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="scolapro-record-title">{receipt.learnerName}</p>
            <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{receipt.sourceAcademicYear} → {receipt.destinationAcademicYear ?? "—"}{receipt.destinationGradeCode ? ` · ${receipt.destinationGradeCode}` : ""} · {receipt.outcome.replaceAll("_", " ")}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 text-[0.68rem] font-medium text-[color:var(--success)]">
            <CheckCircle2 className="size-3" aria-hidden="true" />Published {new Date(receipt.publishedAt).toLocaleDateString()}
          </span>
        </div>)}
      </div>
    </section> : null}

    <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
        <h2 className="scolapro-section-title">Learners · {workspace.academicYear}{workspace.selectedGradeId ? ` · ${workspace.grades.find((grade) => grade.id === workspace.selectedGradeId)?.label ?? ""}` : ""}</h2>
        <p className="scolapro-section-description">Reviewed decisions can be overridden with a reason. Approval, locking and publication are separate governed steps.</p>
      </div>
      {workspace.learners.length ? <div className="divide-y divide-border-subtle">{workspace.learners.map((learner) => <LearnerRow
        key={learner.enrolmentId}
        learner={learner}
        canApprove={canApprove}
        destinationChoices={workspace.destinationChoices}
        nextAcademicYear={workspace.nextAcademicYear}
        today={today}
        generateAction={generateAction}
        overrideAction={overrideAction}
        approveAction={approveAction}
        lockAction={lockAction}
        publishAction={publishAction}
        pending={{ generate: generatePending, override: overridePending, approve: approvePending, lock: lockPending, publish: publishPending }}
        publishError={publishState.message && !publishState.success ? publishState.message : null}
      />)}</div> : <p className="px-5 py-10 text-center text-sm text-muted-foreground">No current enrolments were found for {workspace.academicYear}.</p>}
    </section>
  </div>;
}

function LearnerRow({
  learner, canApprove, destinationChoices, nextAcademicYear, today,
  generateAction, overrideAction, approveAction, lockAction, publishAction, pending, publishError,
}: {
  learner: ProgressionLearner;
  canApprove: boolean;
  destinationChoices: ProgressionWorkspace["destinationChoices"];
  nextAcademicYear: number;
  today: string;
  generateAction: (formData: FormData) => void;
  overrideAction: (formData: FormData) => void;
  approveAction: (formData: FormData) => void;
  lockAction: (formData: FormData) => void;
  publishAction: (formData: FormData) => void;
  pending: { generate: boolean; override: boolean; approve: boolean; lock: boolean; publish: boolean };
  publishError: string | null;
}) {
  const [overriding, setOverriding] = useState(false);
  const [overrideOutcome, setOverrideOutcome] = useState(learner.progression?.outcome ?? "promoted");
  const [destinationGradeCode, setDestinationGradeCode] = useState(learner.progression?.destinationGradeCode ?? "");
  const initialGradeCode = learner.progression?.destinationGradeCode ?? "";
  const [destinationClassId, setDestinationClassId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [confirmed, setConfirmed] = useState(false);

  const destinationGradeCodes = [...new Set(destinationChoices.map((choice) => choice.gradeCode))];
  const effectiveDestinationGrade = learner.progression?.outcome === "not_promoted" ? learner.gradeCode : destinationGradeCode;
  const classChoices = destinationChoices.filter((choice) => choice.gradeCode === effectiveDestinationGrade);
  const canPublish = Boolean(learner.progression?.status === "locked" && !learner.publication && destinationClassId && effectiveOn && confirmed);
  const recommendation = learner.recommendation;
  const progression = learner.progression;

  return <article data-testid={`progression-learner-${learner.enrolmentId}`} className="px-4 py-4 sm:px-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="scolapro-record-title">{learner.learnerName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{learner.gradeName || learner.gradeCode}{learner.registerClassName ? ` · ${learner.registerClassName}` : ""}{learner.admissionNumber ? ` · ${learner.admissionNumber}` : ""}</p>
        <p className="mt-1 text-[0.68rem] text-muted-foreground">
          {recommendation
            ? `Engine recommendation: ${outcomeLabel(recommendation.outcome)} · ${recommendation.subjectCount} subject${recommendation.subjectCount === 1 ? "" : "s"} · ${recommendation.failedSubjects} failed${recommendation.overallAverage === null ? "" : ` · average ${recommendation.overallAverage}`}`
            : learner.ruleSetId ? "Recommendation not generated yet." : "No active promotion rule set for this grade."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {progression ? <span className="text-[0.68rem] text-muted-foreground">Decision: <span className="font-semibold capitalize">{outcomeLabel(progression.outcome)}</span></span> : null}
        <StatusChip status={progression?.status ?? null} />
      </div>
    </div>

    {progression?.overrideReason ? <p className="mt-2 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-[0.68rem] text-muted-foreground">Override reason: {progression.overrideReason}</p> : null}
    {learner.publication ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 text-[0.68rem] font-medium text-[color:var(--success)]"><CheckCircle2 className="size-3" aria-hidden="true" />Published into {learner.publication.destinationAcademicYear}{learner.publication.destinationGradeCode ? ` · ${learner.publication.destinationGradeCode}` : ""} on {new Date(learner.publication.publishedAt).toLocaleDateString()}</p> : null}

    <div className="mt-3 flex flex-wrap items-start gap-2">
      {!progression ? <form action={generateAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="enrolmentId" value={learner.enrolmentId} />
        <input type="hidden" name="ruleSetId" value={learner.ruleSetId ?? ""} />
        <button type="submit" disabled={pending.generate || !learner.ruleSetId}
          className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong disabled:cursor-not-allowed disabled:opacity-50">
          {pending.generate ? <Spinner className="size-3.5" /> : <UserRoundCheck className="size-3.5" aria-hidden="true" />}
          {pending.generate ? "Generating…" : "Generate recommendation"}
        </button>
        {learner.ruleSetLabel ? <span className="text-[0.68rem] text-muted-foreground">{learner.ruleSetLabel}</span> : null}
      </form> : null}

      {progression?.status === "reviewed" ? <>
        <button type="button" onClick={() => setOverriding((current) => !current)} disabled={pending.override}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold text-foreground disabled:opacity-50">
          {overriding ? "Close override" : "Override outcome"}
        </button>
        {canApprove ? <form action={approveAction}>
          <input type="hidden" name="progressionId" value={progression.id} />
          <button type="submit" disabled={pending.approve}
            className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50">
            {pending.approve ? <Spinner className="size-3.5 text-white" /> : <ArrowRight className="size-3.5" aria-hidden="true" />}
            {pending.approve ? "Approving…" : "Approve decision"}
          </button>
        </form> : <span className="text-[0.68rem] text-muted-foreground">Approval requires school leadership.</span>}
      </> : null}

      {progression?.status === "approved" && canApprove ? <form action={lockAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="progressionId" value={progression.id} />
        <input type="hidden" name="confirmation" value="confirmed" />
        <button type="submit" disabled={pending.lock}
          className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50">
          {pending.lock ? <Spinner className="size-3.5 text-white" /> : <LockKeyhole className="size-3.5" aria-hidden="true" />}
          {pending.lock ? "Locking…" : "Lock decision"}
        </button>
        <span className="text-[0.68rem] text-muted-foreground">Locking makes the decision final.</span>
      </form> : null}
    </div>

    {overriding && progression?.status === "reviewed" ? <form action={overrideAction} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2">
      <input type="hidden" name="progressionId" value={progression.id} />
      <Picker label="Outcome" name="outcome" value={overrideOutcome} onChange={setOverrideOutcome} options={outcomeOptions} placeholder="Choose outcome" />
      <Picker label={`Destination grade · ${nextAcademicYear}`} value={destinationGradeCode} onChange={setDestinationGradeCode} searchable
        options={destinationGradeCodes.map((code) => ({ value: code, label: code }))} placeholder="Choose grade" />
      <input type="hidden" name="destinationGradeCode" value={destinationGradeCode} />
      <label className="block text-xs font-medium sm:col-span-2">Reason for override
        <textarea name="reason" required minLength={2} maxLength={800} rows={2}
          className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-soft" />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending.override || (overrideOutcome === progression.outcome && destinationGradeCode === initialGradeCode)}
          className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft inline-flex min-h-9 items-center rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50">
          {pending.override ? "Saving…" : "Save override"}
        </button>
        <button type="button" onClick={() => setOverriding(false)} className="min-h-9 rounded-[var(--radius-sm)] bg-surface px-3 text-xs font-semibold text-foreground shadow-[var(--shadow-xs)]">Cancel</button>
      </div>
      <p className="text-[0.68rem] text-muted-foreground sm:col-span-2">An override must change the outcome or destination grade and is audited with its reason. Repeating a grade keeps the source grade.</p>
    </form> : null}

    {progression?.status === "locked" && !learner.publication ? <form action={publishAction} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2">
      <input type="hidden" name="progressionId" value={progression.id} />
      <Picker label={`Destination class · ${nextAcademicYear}`} value={destinationClassId} onChange={setDestinationClassId} searchable
        options={classChoices.map((choice) => ({ value: choice.id, label: choice.displayName, helper: choice.gradeCode }))}
        placeholder={classChoices.length ? "Choose class" : "No class for the destination grade"} />
      <input type="hidden" name="destinationRegisterClassId" value={destinationClassId} />
      <DateField label="Effective from" name={`progression-${progression.id}-effective`} value={effectiveOn} onChange={setEffectiveOn} required />
      <input type="hidden" name="effectiveOn" value={effectiveOn} />
      <div className="sm:col-span-2">
        <CheckboxField checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}
          label={`Create the ${nextAcademicYear} enrolment and close the ${learner.gradeName || learner.gradeCode} enrolment.`} />
        {/* The governed action requires an explicit confirmation token; the
            checkbox is the operator's affordance and this carries its value. */}
        <input type="hidden" name="confirmation" value={confirmed ? "confirmed" : ""} />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={pending.publish || !canPublish}
          className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending.publish ? <Spinner className="size-4 text-white" /> : <Send className="size-4" aria-hidden="true" />}
          {pending.publish ? "Publishing…" : "Publish rollover"}
        </button>
        <button type="button" onClick={() => { setDestinationClassId(""); setConfirmed(false); setEffectiveOn(today); }} className="min-h-10 rounded-[var(--radius-sm)] bg-surface px-3 text-sm font-semibold text-foreground shadow-[var(--shadow-xs)]">Cancel</button>
      </div>
      {!workspaceNextYearNote(classChoices.length) ? null : <p className="text-[0.68rem] text-muted-foreground sm:col-span-2">{workspaceNextYearNote(classChoices.length)}</p>}
      {publishError ? <p role="alert" className="text-[0.68rem] font-medium text-[color:var(--danger)] sm:col-span-2">{publishError}</p> : null}
    </form> : null}
  </article>;
}

function workspaceNextYearNote(classCount: number) {
  return classCount ? "" : "No register class exists for the destination grade in the next academic year.";
}
