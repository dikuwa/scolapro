import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { RolloverReadiness } from "@/features/progression/server/rollover-readiness";

export function RolloverReadinessPanel({ rows, setupHref }: { rows: RolloverReadiness[]; setupHref: string }) {
  const readyCount = rows.filter((row) => row.ready).length;
  return <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5" aria-labelledby="rollover-readiness-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 id="rollover-readiness-title" className="scolapro-section-title">Next-year configuration readiness</h2>
        <p className="scolapro-section-description">Rollover uses configured academic years, matching grades/register classes and an active versioned promotion rule set. No thresholds are assumed.</p>
      </div>
      <Link href={setupHref} className="scolapro-cta inline-flex min-h-9 items-center justify-center bg-brand-soft px-3 text-xs font-semibold text-brand-strong">Open academic setup</Link>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{readyCount} of {rows.length} source grade{rows.length === 1 ? "" : "s"} ready</p>
    <div className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
      {rows.map((row) => <div key={row.sourceGradeId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="scolapro-record-title">{row.sourceGradeName || row.sourceGradeCode}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.sourceGradeCode} → {row.nextAcademicYear} · {row.nextGradeCount} matching grade · {row.nextRegisterClassCount} register class{row.nextRegisterClassCount === 1 ? "" : "es"} · {row.activeRuleSetLabel ?? "No active promotion rule set"}</p>
          {row.blockers.length ? <ul className="mt-2 space-y-1 text-[0.68rem] text-[color:var(--warning)]">{row.blockers.map((blocker) => <li key={blocker.code} className="flex items-start gap-1.5"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{blocker.code.replaceAll("_", " ")}</li>)}</ul> : null}
        </div>
        {row.ready ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1 text-[0.68rem] font-medium text-[color:var(--success)]"><CheckCircle2 className="size-3.5" aria-hidden="true" />Ready</span> : null}
      </div>)}
      {!rows.length ? <p className="py-4 text-sm text-muted-foreground">Configure at least one source grade before starting rollover.</p> : null}
    </div>
  </section>;
}
