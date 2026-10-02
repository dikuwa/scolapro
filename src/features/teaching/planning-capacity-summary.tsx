import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import type { PlanningCapacityRow, PlanningException } from "@/features/teaching/server/queries";

function number(value: number | null) {
  return value === null ? "—" : String(value);
}

const statusLabel: Record<PlanningCapacityRow["capacityStatus"], string> = {
  ready: "Capacity ready",
  over_capacity: "Plan over capacity",
  insufficient_remaining: "Remaining capacity short",
  term_over_capacity: "Term over capacity",
  source_unresolved: "Official source unresolved",
  calendar_incomplete: "Calendar incomplete",
};

export function PlanningCapacitySummary({
  rows,
  exceptions,
  showExceptions,
}: {
  rows: PlanningCapacityRow[];
  exceptions: PlanningException[];
  showExceptions: boolean;
}) {
  const atRisk = rows.filter((row) => row.capacityStatus !== "ready").length;
  const yearExpected = rows.reduce((sum, row) => sum + row.yearExpectedOpportunities, 0);
  const yearPlanned = rows.reduce((sum, row) => sum + row.yearPlannedPeriods, 0);
  const futureShort = rows.filter((row) => row.futureRemainingCapacity < 0).length;

  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-4 border-b border-border-subtle pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]">
            <CalendarClock className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="scolapro-section-title">Planning capacity</h2>
            <p className="scolapro-section-description !mt-0 max-w-3xl">
              Real teaching opportunities come from the school calendar and timetable. Closures and rotating-cycle movement are resolved from the governed calendar; capacity is never estimated as periods per cycle × weeks.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[30rem]">
          {[
            ["Plan/class rows", rows.length],
            ["Year opportunities", yearExpected],
            ["Planned periods", yearPlanned],
            ["At risk", atRisk],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[var(--radius-sm)] bg-surface-muted px-2.5 py-2 text-center">
              <p className="text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {futureShort > 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[color:var(--warning-soft)] px-3 py-2.5 text-[color:var(--warning)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-5">
            {futureShort} plan/class row{futureShort === 1 ? "" : "s"} ha{futureShort === 1 ? "s" : "ve"} more outstanding planned periods than calendar-adjusted teaching opportunities remaining.
          </p>
        </div>
      ) : null}

      {rows.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <article key={`${row.planId}:${row.registerClassId}`} className="min-w-0 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.subjectName}</p>
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                    {row.className} · {row.gradeName} · {row.planLevel}
                  </p>
                </div>
                <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${row.capacityStatus === "ready" ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"}`}>
                  {statusLabel[row.capacityStatus]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle">
                <div className="px-2.5 py-2.5 text-center">
                  <p className="text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground">Official / cycle</p>
                  <p className="mt-1 text-base font-semibold">{number(row.officialPeriodsPerCycle)}</p>
                </div>
                <div className="border-l border-border-subtle px-2.5 py-2.5 text-center">
                  <p className="text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground">School target</p>
                  <p className="mt-1 text-base font-semibold">{row.schoolTargetPeriodsPerCycle}</p>
                </div>
                <div className="border-l border-border-subtle px-2.5 py-2.5 text-center">
                  <p className="text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground">Expected year</p>
                  <p className="mt-1 text-base font-semibold">{row.yearExpectedOpportunities}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[var(--radius-sm)] bg-surface-muted px-2 py-2">
                  <p className="text-[0.58rem] uppercase tracking-wide text-muted-foreground">Planned</p>
                  <p className="mt-0.5 text-sm font-semibold">{row.yearPlannedPeriods}</p>
                </div>
                <div className="rounded-[var(--radius-sm)] bg-surface-muted px-2 py-2">
                  <p className="text-[0.58rem] uppercase tracking-wide text-muted-foreground">Year remaining</p>
                  <p className="mt-0.5 text-sm font-semibold">{row.yearRemainingCapacity}</p>
                </div>
                <div className="rounded-[var(--radius-sm)] bg-surface-muted px-2 py-2">
                  <p className="text-[0.58rem] uppercase tracking-wide text-muted-foreground">Future remaining</p>
                  <p className="mt-0.5 text-sm font-semibold">{row.futureRemainingCapacity}</p>
                </div>
              </div>

              {row.currentTermName ? (
                <p className="mt-3 text-[0.68rem] text-muted-foreground">
                  {row.currentTermName}: <strong className="font-semibold text-foreground">{number(row.currentTermPlannedPeriods)}</strong> planned / <strong className="font-semibold text-foreground">{number(row.currentTermExpectedOpportunities)}</strong> opportunities · <strong className="font-semibold text-foreground">{number(row.currentTermRemainingCapacity)}</strong> remaining
                </p>
              ) : null}

              {row.capacityWarnings.length ? (
                <ul className="mt-2 space-y-1 rounded-[var(--radius-sm)] bg-[color:var(--warning-soft)] px-2.5 py-2 text-[0.68rem] leading-5 text-[color:var(--warning)]">
                  {row.capacityWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-[color:var(--success)]">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" /> Planned demand fits the known calendar-adjusted capacity.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-7 text-center text-xs text-muted-foreground">
          Capacity appears after a connected pacing plan and timetable allocation exist.
        </p>
      )}

      {showExceptions ? (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="scolapro-record-title">HOD / leadership exceptions</h3>
          <p className="mt-1 text-xs text-muted-foreground">Exceptions only—no teacher ranking or productivity score.</p>
          {exceptions.length ? (
            <ul className="mt-3 grid gap-2 lg:grid-cols-2">
              {exceptions.map((exception) => (
                <li key={exception.key} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5">
                  <p className="text-xs font-semibold">{exception.subjectName} · {exception.className}</p>
                  <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{exception.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No planning-capacity or timetable-demand exceptions are in scope.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
