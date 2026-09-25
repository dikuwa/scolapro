"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, CalendarCheck2, CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, Lock, Percent, Printer, QrCode, ShieldCheck, UsersRound } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import type { OfficialAttendanceSummary } from "@/features/attendance/server/official-summary";
import { finalizeOfficialAttendanceSummary, type FinalizeOfficialAttendanceSummaryResult } from "@/features/attendance/server/actions";
import type { OfficialAttendanceSummaryFinalization } from "@/features/attendance/server/finalization";

const weekdayFormatter = new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric", month: "short" });
const longDateFormatter = new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function shortDate(value: string) {
  return weekdayFormatter.format(new Date(`${value}T12:00:00`));
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function shiftWeek(date: string, direction: -1 | 1) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + direction * 7);
  return value.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `date` — client-side twin of the server helper. */
function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function OfficialSummary({
  summary,
  date,
  mode,
  schoolId,
  academicYear,
  termId,
  canFinalize,
  finalization,
  qrSvg,
}: {
  summary: OfficialAttendanceSummary;
  date: string;
  mode: "week" | "term";
  schoolId: string;
  academicYear: number;
  termId?: string | null;
  canFinalize: boolean;
  finalization: OfficialAttendanceSummaryFinalization | null;
  qrSvg?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(params: { date?: string; term?: string; mode?: string }) {
    const next = new URLSearchParams();
    next.set("view", "official");
    next.set("date", params.date ?? date);
    next.set("mode", params.mode ?? mode);
    if (params.term) next.set("term", params.term);
    startTransition(() => router.replace(`/attendance?${next.toString()}`, { scroll: false }));
  }

  function exportUrl(format: string) {
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("date", date);
    if (termId) params.set("term", termId);
    params.set("format", format);
    return `/api/official-documents/attendance-summary?${params.toString()}`;
  }

  function handleFinalize() {
    startTransition(async () => {
      const result: FinalizeOfficialAttendanceSummaryResult = await finalizeOfficialAttendanceSummary({
        schoolId,
        academicYear,
        mode,
        date,
        termId: termId ?? null,
      });
      if (result.success) {
        toast.success(result.message ?? "Official attendance summary finalized.");
        router.refresh();
      } else {
        toast.error(result.message ?? "The summary could not be finalized.");
      }
    });
  }

  const readiness = summary.readiness;
  const incompletePreview = readiness.incomplete.slice(0, 4);
  const remaining = readiness.incomplete.length - incompletePreview.length;
  const lastReportedOn = summary.lastTeachingDate ? longDateFormatter.format(new Date(`${summary.lastTeachingDate}T12:00:00`)) : "—";

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-0 lg:flex-1">
            <Picker
              label="Reporting period"
              name="official-mode-ui"
              value={mode}
              onChange={(next) => navigate({ mode: next })}
              placeholder="Weekly"
              options={[
                { value: "week", label: "Weekly summary" },
                { value: "term", label: "Term summary" },
              ]}
              className="max-w-xs"
            />
            {mode === "term" ? (
              <Picker
                label="Term"
                name="official-term-ui"
                value={summary.term?.id ?? ""}
                onChange={(next) => navigate({ term: next })}
                placeholder="Select term"
                options={summary.terms.map((item) => ({ value: item.id, label: item.displayName, helper: item.startsOn && item.endsOn ? `${shortDate(item.startsOn)} – ${shortDate(item.endsOn)}` : undefined }))}
                className="max-w-xs"
                disabled={summary.terms.length === 0}
              />
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Week ending</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button type="button" disabled={pending} onClick={() => navigate({ date: shiftWeek(date, -1) })} aria-label="Previous week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronLeft className="size-4" /></button>
                  <div className="relative min-w-0 flex-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium sm:min-w-40 sm:flex-none">
                    {pending ? <span className="absolute inset-0 grid place-items-center"><Spinner className="size-4 text-brand" /></span> : null}
                    <span className={pending ? "opacity-0" : ""}>{lastReportedOn}</span>
                  </div>
                  <button type="button" disabled={pending} onClick={() => navigate({ date: shiftWeek(date, 1) })} aria-label="Next week" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronRight className="size-4" /></button>
                </div>
              </div>
            )}
          </div>
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-border-subtle sm:grid-cols-3">
            <div className="flex items-center justify-between gap-4 bg-surface px-4 py-3.5">
              <div><p className="text-xs font-medium text-muted-foreground">Possible attendances</p><p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-foreground">{summary.schoolTotals.possibleAttendances.toLocaleString("en")}</p></div>
              <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border-subtle bg-surface px-4 py-3.5 sm:border-l sm:border-t-0">
              <div><p className="text-xs font-medium text-muted-foreground">Absent learner-days</p><p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[color:var(--accent-amber)]">{summary.schoolTotals.absentLearnerDays.toLocaleString("en")}</p></div>
              <span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><CalendarCheck2 className="size-4" aria-hidden="true" /></span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border-subtle bg-surface px-4 py-3.5 sm:border-l sm:border-t-0">
              <div><p className="text-xs font-medium text-muted-foreground">% absence</p><p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{formatPercent(summary.schoolTotals.percentAbsence)}</p></div>
              <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><Percent className="size-4" aria-hidden="true" /></span>
            </div>
          </div>
        </div>
        {!readiness.complete ? (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-border-subtle bg-warning-soft px-4 py-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color:var(--warning)]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{readiness.submittedRegisters} of {readiness.expectedRegisters} register classes complete</p>
                <p className="mt-0.5 text-[0.7rem] leading-5 text-muted-foreground">
                  {incompletePreview.map((item) => `${item.gradeName} ${item.className} — ${shortDate(item.date)}`).join("; ")}
                  {remaining > 0 ? `; and ${remaining} more` : ""}. The summary excludes unconfirmed registers.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ShieldCheck className="size-3.5 text-[color:var(--success)]" aria-hidden="true" />All expected registers are confirmed for this period.</p>
        )}
      </section>

      <FinalizationPanel
        summary={summary}
        mode={mode}
        readinessComplete={readiness.complete}
        canFinalize={canFinalize}
        finalization={finalization}
        qrSvg={qrSvg}
        pending={pending}
        onFinalize={handleFinalize}
        exportUrl={exportUrl}
      />

      {!summary.classes.length || !summary.teachingDates.length ? (
        <section className="rounded-[var(--radius-md)] bg-surface px-5 py-10 text-center shadow-[var(--shadow-xs)]">
          <span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><CalendarCheck2 className="size-5" aria-hidden="true" /></span>
          <h2 className="mt-3 text-sm font-semibold">Nothing to summarise yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{summary.classes.length ? "The reporting period contains no expected school day, so there are no possible attendances to report." : "No register classes are configured for this academic year yet."}</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:px-5">
            <h2 className="scolapro-section-title">{mode === "term" ? `Term summary${summary.term ? ` — ${summary.term.displayName}` : ""}` : "Weekly summary"}</h2>
            <p className="scolapro-section-description">Official % absence from the daily register: absent learner-days over possible learner attendances, by register class and grade. Late and excused are not absence; days without teaching contribute nothing.</p>
          </div>
          {mode === "term" ? (
            <TermTable summary={summary} formatPercent={formatPercent} />
          ) : (
            <WeekTable summary={summary} />
          )}
        </section>
      )}
    </div>
  );
}

function FinalizationPanel({
  summary,
  mode,
  readinessComplete,
  canFinalize,
  finalization,
  qrSvg,
  pending,
  onFinalize,
  exportUrl,
}: {
  summary: OfficialAttendanceSummary;
  mode: "week" | "term";
  readinessComplete: boolean;
  canFinalize: boolean;
  finalization: OfficialAttendanceSummaryFinalization | null;
  qrSvg?: string | null;
  pending: boolean;
  onFinalize: () => void;
  exportUrl: (format: string) => string;
}) {
  if (finalization) {
    const finalizedLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(finalization.finalizedAt));
    return (
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted/40 p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CheckCircle2 className="size-4 text-[color:var(--success)]" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--success)]">
                <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-0.5 text-[0.7rem] font-semibold text-[color:var(--success)]">FINALIZED</span>
                {mode === "term" ? "Term summary" : "Weekly summary"} · Revision {finalization.revision}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ref {finalization.scolaproReference} · Finalized {finalizedLabel}
                {finalization.revision > 1 ? " · Supersedes revision " + (finalization.revision - 1) : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a className="scolapro-cta inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] hover:bg-surface-muted" href={exportUrl("html")} target="_blank" rel="noopener noreferrer"><FileText className="scolapro-cta-icon size-3.5" aria-hidden="true" />Preview</a>
            <a className="scolapro-cta inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] hover:bg-surface-muted" href={exportUrl("pdf")} target="_blank" rel="noopener noreferrer"><Printer className="scolapro-cta-icon size-3.5" aria-hidden="true" />Print</a>
            <a className="scolapro-cta inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] hover:bg-surface-muted" href={exportUrl("pdf")}><Download className="scolapro-cta-icon size-3.5" aria-hidden="true" />PDF</a>
            <a className="scolapro-cta inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] hover:bg-surface-muted" href={exportUrl("xlsx")}><Download className="scolapro-cta-icon size-3.5" aria-hidden="true" />Excel</a>
            {canFinalize ? (
              <button type="button" onClick={onFinalize} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 py-2 text-xs font-semibold text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
                {pending ? <Spinner className="size-3.5" /> : <ArrowUpRight className="size-3.5" aria-hidden="true" />}
                Create new revision
              </button>
            ) : null}
          </div>
        </div>
        {qrSvg ? (
          <div className="mt-4 flex items-center gap-3 border-t border-border-subtle pt-4">
            <span className="grid size-20 place-items-center rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-1.5" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="min-w-0 text-xs text-muted-foreground">
              <p className="inline-flex items-center gap-1.5 font-medium text-foreground"><QrCode className="size-3.5" aria-hidden="true" />Verification QR</p>
              <p className="mt-0.5">Scan to verify this finalized summary at its public verification page. Each revision carries its own code.</p>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (!readinessComplete) {
    return (
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground"><Lock className="mr-1 inline size-3.5 align-[-0.1rem] text-[color:var(--muted-foreground)]" aria-hidden="true" />Finalize once all expected registers are confirmed for this period.</p>
          <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-xs font-semibold text-muted-foreground opacity-70"><Lock className="size-3.5" aria-hidden="true" />Finalize official summary</button>
        </div>
      </section>
    );
  }

  if (!canFinalize) {
    return (
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <p className="text-xs text-muted-foreground"><Lock className="mr-1 inline size-3.5 align-[-0.1rem]" aria-hidden="true" />Finalization requires Principal, Deputy Principal or School Admin authority. The summary can be finalized once all registers are confirmed.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">All expected registers are confirmed. Finalizing freezes this summary as an immutable, verifiable official document.</p>
        <button type="button" onClick={onFinalize} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 py-2 text-xs font-semibold text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Spinner className="size-3.5" /> : <ShieldCheck className="size-3.5" aria-hidden="true" />}
          Finalize official summary
        </button>
      </div>
    </section>
  );
}

function Split({ value }: { value: { boys: number; girls: number; total: number } }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums">
      <span className="text-sm font-semibold text-foreground">{value.total}</span>
      <span className="text-[0.66rem] text-muted-foreground">{value.boys}B / {value.girls}G</span>
    </span>
  );
}

function WeekTable({ summary }: { summary: OfficialAttendanceSummary }) {
  const lastDate = summary.lastTeachingDate;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left">
        <thead>
          <tr className="border-b border-border-subtle text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-semibold sm:px-5">Register class</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Boys absent</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Girls absent</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Total absent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {summary.classRows.map((row) => {
            const cell = lastDate ? row.weekly.find((week) => week.weekId === mondayFor(lastDate))?.absences : null;
            const shown = cell ?? { boys: 0, girls: 0, total: 0 };
            return (
              <tr key={row.classId} className="text-sm">
                <th scope="row" className="max-w-56 truncate px-4 py-3 font-medium sm:px-5"><span className="scolapro-record-title">{row.gradeName} {row.className}</span></th>
                <td className="px-3 py-3 text-right tabular-nums">{shown.boys}</td>
                <td className="px-3 py-3 text-right tabular-nums">{shown.girls}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{shown.total}</td>
              </tr>
            );
          })}
          <GradeRows summary={summary} weekId={lastDate ? mondayFor(lastDate) : null} />
          <tr className="bg-surface-muted/55 text-sm">
            <th scope="row" className="px-4 py-3 font-semibold sm:px-5"><span className="scolapro-record-title">School total</span></th>
            {(() => {
              const week = lastDate ? summary.schoolTotals.weekly.find((item) => item.weekId === mondayFor(lastDate)) : null;
              const split = { boys: 0, girls: 0, total: week?.absentLearnerDays ?? 0 };
              return (
                <>
                  <td className="px-3 py-3 text-right tabular-nums" aria-label="Boys absent">—</td>
                  <td className="px-3 py-3 text-right tabular-nums" aria-label="Girls absent">—</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{split.total}</td>
                </>
              );
            })()}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GradeRows({ summary, weekId }: { summary: OfficialAttendanceSummary; weekId: string | null }) {
  if (!summary.gradeRows.length) return null;
  return (
    <>
      {summary.gradeRows.map((row) => {
        const cell = weekId ? row.weekly.find((week) => week.weekId === weekId)?.absences : null;
        const shown = cell ?? { boys: 0, girls: 0, total: 0 };
        return (
          <tr key={row.gradeId ?? "ungraded"} className="bg-surface-muted/35 text-sm">
            <th scope="row" className="px-4 py-3 font-medium sm:px-5"><span className="scolapro-record-title">{row.gradeName} (grade total)</span></th>
            <td className="px-3 py-3 text-right tabular-nums">{shown.boys}</td>
            <td className="px-3 py-3 text-right tabular-nums">{shown.girls}</td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums">{shown.total}</td>
          </tr>
        );
      })}
    </>
  );
}

function TermTable({ summary, formatPercent }: { summary: OfficialAttendanceSummary; formatPercent: (value: number | null) => string }) {
  const weekIds = summary.schoolTotals.weekly.map((week) => week.weekId);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left">
        <thead>
          <tr className="border-b border-border-subtle text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-semibold sm:px-5">Register class</th>
            {summary.classRows[0]?.weekly.map((week) => <th key={week.weekId} scope="col" className="px-3 py-2.5 text-right font-semibold">{week.weekLabel}</th>)}
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Term absent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {summary.classRows.map((row) => (
            <tr key={row.classId} className="text-sm">
              <th scope="row" className="max-w-56 truncate px-4 py-3 font-medium sm:px-5"><span className="scolapro-record-title">{row.gradeName} {row.className}</span></th>
              {row.weekly.map((week) => <td key={week.weekId} className="px-3 py-3 text-right tabular-nums"><Split value={week.absences} /></td>)}
              <td className="px-3 py-3 text-right font-semibold tabular-nums"><Split value={row.absences} /></td>
            </tr>
          ))}
          {summary.gradeRows.map((row) => (
            <tr key={row.gradeId ?? "ungraded"} className="bg-surface-muted/35 text-sm">
              <th scope="row" className="px-4 py-3 font-medium sm:px-5"><span className="scolapro-record-title">{row.gradeName} (grade total)</span></th>
              {row.weekly.map((week) => <td key={week.weekId} className="px-3 py-3 text-right tabular-nums"><Split value={week.absences} /></td>)}
              <td className="px-3 py-3 text-right font-semibold tabular-nums"><Split value={row.absences} /></td>
            </tr>
          ))}
          <tr className="bg-surface-muted/55 text-sm">
            <th scope="row" className="px-4 py-3 font-semibold sm:px-5"><span className="scolapro-record-title">School total</span></th>
            {summary.schoolTotals.weekly.map((week) => <td key={week.weekId} className="px-3 py-3 text-right tabular-nums">{week.absentLearnerDays}</td>)}
            <td className="px-3 py-3 text-right"><span className="text-sm font-semibold tabular-nums">{summary.schoolTotals.absentLearnerDays}</span><span className="ml-1.5 text-[0.66rem] text-muted-foreground">{formatPercent(summary.schoolTotals.percentAbsence)} absence</span></td>
          </tr>
        </tbody>
      </table>
      {!weekIds.length ? <p className="px-5 py-4 text-xs text-muted-foreground">No completed week in this term yet.</p> : null}
    </div>
  );
}
