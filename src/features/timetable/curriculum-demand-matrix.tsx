import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { TimetableDemandRow } from "@/features/timetable/server/workspace";

const statusPresentation: Record<TimetableDemandRow["demandStatus"], { label: string; className: string }> = {
  aligned: { label: "Aligned", className: "bg-[color:var(--success-soft)] text-[color:var(--success)]" },
  under_scheduled: { label: "Under scheduled", className: "bg-[color:var(--danger-soft)] text-[color:var(--danger)]" },
  over_scheduled: { label: "Over scheduled", className: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]" },
  school_override: { label: "School override", className: "bg-[color:var(--accent-indigo-soft)] text-[color:var(--accent-indigo)]" },
  source_missing: { label: "Source missing", className: "bg-surface-muted text-muted-foreground" },
  cycle_variant_missing: { label: "Cycle variant missing", className: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]" },
  source_conflict: { label: "Source conflict", className: "bg-[color:var(--danger-soft)] text-[color:var(--danger)]" },
  constraint_warning: { label: "Constraint warning", className: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]" },
};

function metric(value: number | null) {
  return value === null ? "—" : String(value);
}

export function CurriculumDemandMatrix({ rows }: { rows: TimetableDemandRow[] }) {
  const subjectsResolved = rows.filter((row) => row.officialResolutionStatus === "resolved").length;
  const sourceMissing = rows.filter((row) => row.officialResolutionStatus === "source_missing").length;
  const cycleMissing = rows.filter((row) => row.officialResolutionStatus === "cycle_variant_missing").length;
  const sourceConflicts = rows.filter((row) => row.officialResolutionStatus === "source_conflict").length;
  const targetsSatisfied = rows.filter((row) => row.scheduledVariance === 0).length;
  const under = rows.filter((row) => row.scheduledVariance < 0).length;
  const over = rows.filter((row) => row.scheduledVariance > 0).length;
  const ruleWarnings = rows.filter((row) => row.doublePeriodsRequired > row.doublePeriodsScheduled).length;
  const warnings = rows.filter((row) => row.demandStatus !== "aligned" || row.preGenerationWarnings.length > 0).length;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="scolapro-tone-brand grid size-8 place-items-center rounded-[var(--radius-sm)]">
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="scolapro-section-title">Curriculum demand</h2>
              <p className="scolapro-section-description !mt-0">Official allocation, school target and active timetable count by class. Warnings inform planning; they do not silently rewrite or block the timetable.</p>
            </div>
          </div>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2 sm:min-w-[34rem] sm:max-w-[44rem]">
          <div>
            <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Official/source coverage</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {[
                ["Resolved", subjectsResolved],
                ["Missing", sourceMissing],
                ["Cycle", cycleMissing],
                ["Conflicts", sourceConflicts],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[var(--radius-sm)] bg-surface-muted px-2 py-2 text-center">
                  <p className="text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Timetable demand</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {[
                ["Targets satisfied", targetsSatisfied],
                ["Under", under],
                ["Over", over],
                ["Rule warnings", ruleWarnings],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[var(--radius-sm)] bg-surface-muted px-2 py-2 text-center">
                  <p className="text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {warnings ? (
        <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[color:var(--warning-soft)] px-3 py-2.5 text-[color:var(--warning)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-5">{warnings} demand row{warnings === 1 ? "" : "s"} need review before generation or publication. Source conflicts and missing cycle variants remain governance warnings, not generic system errors.</p>
        </div>
      ) : null}

      {rows.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {rows.map((row) => {
            const presentation = row.demandStatus === "school_override" && row.ruleStrength === "prescribed"
              ? { label: "Prescribed override", className: "bg-[color:var(--danger-soft)] text-[color:var(--danger)]" }
              : statusPresentation[row.demandStatus];
            return (
              <article key={`${row.subjectOfferingId}:${row.registerClassId}`} className="min-w-0 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.subjectName}</p>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{row.className} · {row.gradeName}</p>
                  </div>
                  <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${presentation.className}`}>{presentation.label}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle">
                  <div className="px-2.5 py-2.5 text-center">
                    <p className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">Official</p>
                    <p className="mt-1 text-base font-semibold">{metric(row.officialPeriodsPerCycle)}</p>
                  </div>
                  <div className="border-l border-border-subtle px-2.5 py-2.5 text-center">
                    <p className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">School target</p>
                    <p className="mt-1 text-base font-semibold">{row.schoolTargetPeriodsPerCycle}</p>
                  </div>
                  <div className="border-l border-border-subtle px-2.5 py-2.5 text-center">
                    <p className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">Scheduled</p>
                    <p className="mt-1 text-base font-semibold">{row.scheduledPeriodsPerCycle}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-muted-foreground">
                  <span>Variance <strong className="font-semibold text-foreground">{row.scheduledVariance > 0 ? "+" : ""}{row.scheduledVariance}</strong></span>
                  <span>Origin <strong className="font-semibold text-foreground">{row.allocationOrigin.replaceAll("_", " ")}</strong></span>
                  {row.ruleStrength ? <span>Rule <strong className="font-semibold text-foreground">{row.ruleStrength}</strong></span> : null}
                  {row.doublePeriodsRequired > 0 ? <span>Double periods <strong className="font-semibold text-foreground">{row.doublePeriodsScheduled}/{row.doublePeriodsRequired}</strong></span> : null}
                </div>

                {row.warningMessage ? <p className="mt-2 text-[0.7rem] leading-5 text-muted-foreground">{row.warningMessage}</p> : null}
                {row.preGenerationWarnings.length ? (
                  <div className="mt-2 rounded-[var(--radius-sm)] bg-[color:var(--warning-soft)] px-2.5 py-2 text-[color:var(--warning)]">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-wide">Before generation</p>
                    <ul className="mt-1 space-y-1 text-[0.68rem] leading-5">
                      {row.preGenerationWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                ) : null}
                {row.sourceTitle ? <p className="mt-2 truncate text-[0.64rem] text-muted-foreground" title={[row.sourceTitle, row.sourceLocator].filter(Boolean).join(" · ")}>Source: {row.sourceTitle}{row.sourceLocator ? ` · ${row.sourceLocator}` : ""}</p> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center">
          <p className="text-sm font-medium">No current class demand rows</p>
          <p className="mt-1 text-xs text-muted-foreground">Add an effective teacher allocation for a class and subject offering to include it in timetable readiness.</p>
        </div>
      )}
    </section>
  );
}
