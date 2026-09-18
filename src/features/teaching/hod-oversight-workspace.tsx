import Link from "next/link";
import type { HodTeachingOversightRow } from "@/features/teaching/server/hod-oversight";

function formatDate(value: string | null) {
  if (!value) return "No actual teaching recorded";
  return new Intl.DateTimeFormat("en-NA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Windhoek",
  }).format(new Date(`${value}T12:00:00`));
}

function EvidenceCount({ label, value, empty }: { label: string; value: number; empty: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
      <dt className="text-[0.68rem] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-foreground">{value}</dd>
      {value === 0 ? <p className="mt-1 text-[0.65rem] text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

function OversightCard({ row }: { row: HodTeachingOversightRow }) {
  const missingSchedule = row.planItemCount > 0 && row.scheduledLessonCount === 0;
  const missingPreparation = row.scheduledLessonCount > 0 && row.submittedPreparationCount === 0;
  const missingCoverage = row.scheduledLessonCount > 0 && row.taughtLessonCount === 0;

  return (
    <article className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="scolapro-record-title break-words">{row.subjectName}</h2>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {[row.gradeName, row.className, row.teacherName].filter(Boolean).join(" · ") || "Department-level plan"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[0.68rem]">
          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 font-medium text-muted-foreground">{row.planLevel}</span>
          <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 font-medium text-brand-strong">{row.planStatus}</span>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <EvidenceCount label="Plan items" value={row.planItemCount} empty="No connected plan items recorded." />
        <EvidenceCount label="Scheduled lessons" value={row.scheduledLessonCount} empty="No connected schedule evidence recorded." />
        <EvidenceCount label="Reviewed preparations" value={row.reviewedPreparationCount} empty="No reviewed preparation evidence recorded." />
        <EvidenceCount label="Teaching actuals" value={row.taughtLessonCount} empty="No actual teaching evidence recorded." />
      </dl>

      <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 md:grid-cols-3">
        <div>
          <p className="text-[0.68rem] font-medium text-muted-foreground">Preparation oversight</p>
          <p className="mt-1 text-xs text-foreground">
            {row.submittedPreparationCount} submitted · {row.reviewedPreparationCount} reviewed · {row.returnedPreparationCount} returned
          </p>
        </div>
        <div>
          <p className="text-[0.68rem] font-medium text-muted-foreground">Coverage / reflection</p>
          <p className="mt-1 text-xs text-foreground">
            {row.taughtLessonCount} taught · {row.reflectedLessonCount} with reflection
          </p>
        </div>
        <div>
          <p className="text-[0.68rem] font-medium text-muted-foreground">Latest recorded teaching</p>
          <p className="mt-1 text-xs text-foreground">{formatDate(row.latestTaughtOn)}</p>
        </div>
      </div>

      {(missingSchedule || missingPreparation || missingCoverage) ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/35 px-3 py-2.5 text-xs text-muted-foreground">
          Missing evidence is shown as missing. ScolaPro does not infer compliance from an empty teaching record.
        </div>
      ) : null}
    </article>
  );
}

export function HodOversightWorkspace({ rows }: { rows: HodTeachingOversightRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="scolapro-section-title">Governed subject oversight</h2>
          <p className="scolapro-section-description">Only subjects in your current effective HOD responsibility are included.</p>
        </div>
        <Link href="/teaching/reviews" className="scolapro-cta inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] border border-border-subtle px-3 text-xs font-semibold">
          Open preparation reviews
        </Link>
      </div>

      {rows.length ? (
        <div className="space-y-3">{rows.map((row) => <OversightCard key={row.planId} row={row} />)}</div>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-8 text-center">
          <h2 className="text-sm font-semibold text-foreground">No governed teaching records in scope</h2>
          <p className="mx-auto mt-1 max-w-xl text-xs text-muted-foreground">
            No connected pacing plan is currently visible for your effective subject responsibility. This is an empty evidence state, not a compliance result.
          </p>
        </div>
      )}
    </div>
  );
}
