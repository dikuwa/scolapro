import type {
  AcademicAnalysisView,
  AcademicAnalysisWorkspace,
  AcademicTrendComparison,
  LearnerRiskRow,
} from "@/features/academics/server/academic-analysis";

function percent(value: number | null) {
  return value == null ? "—" : String(value) + "%";
}

function riskBadge(row: LearnerRiskRow) {
  if (row.riskLevel === "high") return "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
  if (row.riskLevel === "watch") return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
}

function trendLabel(comparison: AcademicTrendComparison) {
  if (comparison.status !== "comparable") return "Not comparable";
  if (comparison.passRateDelta == null) return "Comparable";
  return (comparison.passRateDelta > 0 ? "+" : "") + comparison.passRateDelta + " pp";
}

function EmptyState({ basis }: { basis: AcademicAnalysisWorkspace["basis"] }) {
  return (
    <section className="rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center">
      <h2 className="scolapro-section-title">{basis === "official" ? "No official results available" : "No provisional results available"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{basis === "official" ? "No locked official results are available for this year and term. Provisional assessment data is not mixed into this view." : "No complete provisional subject results are currently calculable for this year and term."}</p>
    </section>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold">{value}</p>
    {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
  </div>;
}

function Overview({ workspace }: { workspace: AcademicAnalysisWorkspace }) {
  const highRisk = workspace.learnerRiskRows.filter((row) => row.riskLevel === "high").length;
  const twoPlusFailures = workspace.learnerRiskRows.filter((row) => row.failedSubjects >= 2).length;
  const promotionalRisk = workspace.learnerRiskRows.filter((row) => row.promotionalSubjectFailures > 0).length;
  const nearThreshold = workspace.learnerRiskRows.filter((row) => row.nearThresholdSubjects > 0).length;
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard label="Learners analysed" value={workspace.learnerRiskRows.length} helper="Selected filters and basis" />
      <SummaryCard label="High risk" value={highRisk} helper="Promotion risk, promotional failure or 2+ failures" />
      <SummaryCard label="2+ failures" value={twoPlusFailures} />
      <SummaryCard label={"Near threshold (≤" + workspace.nearThresholdMargin + " pts)"} value={nearThreshold} />
    </section>
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4">
        <div><h2 className="scolapro-section-title">Top achievers</h2><p className="scolapro-section-description">Top 10 by selected-basis numeric average. Ties are not used as a ranking judgment.</p></div>
        <div className="mt-3 space-y-2">{workspace.topLearners.map((row) => <div key={row.enrolmentId} className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.learnerName}</p><p className="text-xs text-muted-foreground">{row.grade} · {row.className || "No class"}</p></div><span className="text-sm font-semibold">{row.average ?? "—"}</span></div>)}</div>
      </div>
      <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4">
        <div><h2 className="scolapro-section-title">Top improvers</h2><p className="scolapro-section-description">Change across shared subjects from the previous term. Learners without comparable shared subjects are excluded.</p></div>
        {workspace.topImprovers.length ? <div className="mt-3 space-y-2">{workspace.topImprovers.map((row) => <div key={row.enrolmentId} className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.learnerName}</p><p className="text-xs text-muted-foreground">{row.sharedImprovementSubjects} shared subject{row.sharedImprovementSubjects === 1 ? "" : "s"}</p></div><span className="text-sm font-semibold">{row.improvement != null && row.improvement > 0 ? "+" : ""}{row.improvement ?? "—"}</span></div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">No comparable prior-term learner series for this selection.</p>}
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-3">
      <SummaryCard label="Promotional-subject risk" value={promotionalRisk} helper="Derived from active promotion-rule subject conditions" />
      <SummaryCard label="Quality metric" value={workspace.qualityConfigured ? "Configured" : "Not configured"} helper={workspace.qualityConfigured ? "Effective-dated grading metadata" : "No A–C or other symbol set is assumed"} />
      <SummaryCard label="Result basis" value={workspace.basis === "official" ? "OFFICIAL" : "PROVISIONAL"} helper={"Academic year " + workspace.academicYear + " · Term " + workspace.termNumber} />
    </section>
  </div>;
}

function Results({ workspace }: { workspace: AcademicAnalysisWorkspace }) {
  return <div className="space-y-5">
    <section className="space-y-3">
      <div><h2 className="scolapro-section-title">Subject results</h2><p className="scolapro-section-description">Descriptive results from the selected basis. Quality is shown only when explicitly configured for the grading-scale version.</p></div>
      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Assessed</th><th className="px-3 py-2">Average</th><th className="px-3 py-2">Median</th><th className="px-3 py-2">Pass %</th><th className="px-3 py-2">Fail %</th><th className="px-3 py-2">Quality %</th></tr></thead><tbody className="divide-y divide-border-subtle">{workspace.subjectSummaries.map((row) => <tr key={row.key}><td className="px-3 py-2 font-medium">{row.key}</td><td className="px-3 py-2">{row.summary.assessedLearners}</td><td className="px-3 py-2">{row.summary.average ?? "—"}</td><td className="px-3 py-2">{row.summary.median ?? "—"}</td><td className="px-3 py-2">{percent(row.summary.passRate)}</td><td className="px-3 py-2">{percent(row.summary.failRate)}</td><td className="px-3 py-2">{percent(row.summary.qualityRate)}</td></tr>)}</tbody></table></div>
    </section>
    <section className="space-y-3">
      <div><h2 className="scolapro-section-title">Teacher–subject context</h2><p className="scolapro-section-description">Historical attribution for context only. No teacher ranking, competence score or winner/loser label is produced.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workspace.teacherSummaries.map((row) => <article key={row.key} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><h3 className="font-medium">{row.key}</h3><dl className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Assessed</dt><dd>{row.summary.assessedLearners}</dd></div><div><dt className="text-xs text-muted-foreground">Average</dt><dd>{row.summary.average ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Pass %</dt><dd>{percent(row.summary.passRate)}</dd></div></dl></article>)}</div>
    </section>
    <section className="space-y-3">
      <div><h2 className="scolapro-section-title">Symbol distribution</h2><p className="scolapro-section-description">Historical grading-scale bands remain authoritative for each official result.</p></div>
      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><table className="w-full min-w-[880px] text-left text-sm"><thead className="bg-surface-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Teacher</th><th className="px-3 py-2">Assessed</th><th className="px-3 py-2">Average</th><th className="px-3 py-2">Pass %</th><th className="px-3 py-2">Symbols</th></tr></thead><tbody className="divide-y divide-border-subtle">{workspace.rows.map((row) => <tr key={row.subjectOfferingId + ":" + (row.className ?? "none")}><td className="px-3 py-2">{row.grade}</td><td className="px-3 py-2">{row.className ?? "—"}</td><td className="px-3 py-2 font-medium">{row.subject}</td><td className="px-3 py-2">{row.teacher ?? "Not attributable"}</td><td className="px-3 py-2">{row.summary.assessedLearners}</td><td className="px-3 py-2">{row.summary.average ?? "—"}</td><td className="px-3 py-2">{percent(row.summary.passRate)}</td><td className="px-3 py-2">{row.summary.symbolDistribution.length ? row.summary.symbolDistribution.map((band) => band.symbol + " " + band.count).join(" · ") : "No grading bands resolved"}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

function GradesAndClasses({ workspace }: { workspace: AcademicAnalysisWorkspace }) {
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className="space-y-3"><div><h2 className="scolapro-section-title">Grades</h2><p className="scolapro-section-description">Selected-basis performance grouped by grade.</p></div><div className="grid gap-3 sm:grid-cols-2">{workspace.gradeSummaries.map((row) => <article key={row.key} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><h3 className="font-medium">{row.label}</h3><p className="mt-2 text-sm">{row.summary.assessedLearners} assessed · Average {row.summary.average ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">Pass {percent(row.summary.passRate)} · Fail {percent(row.summary.failRate)}</p></article>)}</div></section>
    <section className="space-y-3"><div><h2 className="scolapro-section-title">Classes</h2><p className="scolapro-section-description">Historical register-class cohorts, not current roster reassignment.</p></div><div className="grid gap-3 sm:grid-cols-2">{workspace.classSummaries.map((row) => <article key={row.key} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><h3 className="font-medium">{row.label}</h3><p className="mt-2 text-sm">{row.summary.assessedLearners} assessed · Average {row.summary.average ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">Pass {percent(row.summary.passRate)} · Fail {percent(row.summary.failRate)}</p></article>)}</div></section>
  </div>;
}

function LearnersAndRisk({ workspace }: { workspace: AcademicAnalysisWorkspace }) {
  return <section className="space-y-3">
    <div><h2 className="scolapro-section-title">Learners & risk</h2><p className="scolapro-section-description">Read-only risk indicators from governed grading metadata and canonical promotion recommendations. Near-threshold means within {workspace.nearThresholdMargin} points of the configured pass boundary.</p></div>
    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-surface-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Learner</th><th className="px-3 py-2">Grade / class</th><th className="px-3 py-2">Average</th><th className="px-3 py-2">Failures</th><th className="px-3 py-2">Promotional</th><th className="px-3 py-2">Near threshold</th><th className="px-3 py-2">Promotion readiness</th><th className="px-3 py-2">Risk</th></tr></thead><tbody className="divide-y divide-border-subtle">{workspace.learnerRiskRows.map((row) => <tr key={row.enrolmentId}><td className="px-3 py-2"><p className="font-medium">{row.learnerName}</p><p className="text-xs text-muted-foreground">{row.admissionNumber || "No admission no."}</p></td><td className="px-3 py-2">{row.grade} · {row.className || "—"}</td><td className="px-3 py-2">{row.average ?? "—"}</td><td className="px-3 py-2">{row.failedSubjects}</td><td className="px-3 py-2">{row.promotionalSubjectFailures}</td><td className="px-3 py-2">{row.nearThresholdSubjects}</td><td className="px-3 py-2">{row.promotionReadiness.status === "unavailable" ? "Not available for this role/basis" : <><p className="font-medium">{row.promotionReadiness.recommendedOutcome ?? (row.promotionReadiness.status === "ready" ? "Ready" : "Not ready")}</p><p className="text-xs text-muted-foreground">{row.promotionReadiness.failedConditions} failed condition{row.promotionReadiness.failedConditions === 1 ? "" : "s"}</p></>}</td><td className="px-3 py-2"><span className={"rounded-[var(--radius-xs)] px-2 py-1 text-xs font-semibold " + riskBadge(row)}>{row.riskLevel.toUpperCase()}</span></td></tr>)}</tbody></table></div>
  </section>;
}

function Trends({ workspace }: { workspace: AcademicAnalysisWorkspace }) {
  return <section className="space-y-3">
    <div><h2 className="scolapro-section-title">Trends</h2><p className="scolapro-section-description">Term-on-term and year-on-year comparisons use the governed official-series comparator. Mixed provenance, changed grading/rule versions, different subjects or grades are shown as not comparable rather than forced into a trend.</p></div>
    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-surface-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Term-on-term</th><th className="px-3 py-2">Year-on-year</th><th className="px-3 py-2">Comparability</th></tr></thead><tbody className="divide-y divide-border-subtle">{workspace.trends.map((row) => <tr key={row.subjectOfferingId}><td className="px-3 py-2">{row.grade}</td><td className="px-3 py-2 font-medium">{row.subject}</td><td className="px-3 py-2">{trendLabel(row.termOnTerm)}</td><td className="px-3 py-2">{trendLabel(row.yearOnYear)}</td><td className="px-3 py-2 text-xs text-muted-foreground">{[row.termOnTerm.reason, row.yearOnYear.reason].filter(Boolean).join(" · ") || "Comparable governed series"}</td></tr>)}</tbody></table></div>
  </section>;
}

export function AcademicAnalysisViews({ workspace, view }: { workspace: AcademicAnalysisWorkspace; view: AcademicAnalysisView }) {
  if (!workspace.rows.length) return <EmptyState basis={workspace.basis} />;
  if (view === "results") return <Results workspace={workspace} />;
  if (view === "grades") return <GradesAndClasses workspace={workspace} />;
  if (view === "learners") return <LearnersAndRisk workspace={workspace} />;
  if (view === "trends") return <Trends workspace={workspace} />;
  return <Overview workspace={workspace} />;
}
