import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AcademicAnalysisFilters } from "@/features/academics/components/academic-analysis-filters";
import { getAcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function AcademicAnalysisPage({ searchParams }: { searchParams: Promise<{ year?: string; term?: string; basis?: string; grade?: string; class?: string; subject?: string; teacher?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  if (context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const role = context.currentSchoolMembership.roleKey;
  if (!["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"].includes(role)) redirect("/");

  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();
  const term = Math.min(6, Math.max(1, Number(params.term) || 1));
  const basis = params.basis === "provisional" ? "provisional" : "official";
  const workspace = await getAcademicAnalysisWorkspace({ academicYear: year, termNumber: term, basis, grade: params.grade, className: params.class, subjectOfferingId: params.subject, teacher: params.teacher });
  if (!workspace) redirect("/");
  const exportParams = new URLSearchParams({ year: String(year), term: String(term), basis });
  if (params.grade) exportParams.set("grade", params.grade);
  if (params.class) exportParams.set("class", params.class);
  if (params.subject) exportParams.set("subject", params.subject);
  if (params.teacher) exportParams.set("teacher", params.teacher);

  return (
    <main className="scolapro-content-width mx-auto space-y-5 px-4 py-6 sm:px-6">
      <Link href="/assessment" className="scolapro-cta inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="scolapro-cta-icon size-4" aria-hidden="true" /> Assessment
      </Link>
      <header>
        <h1 className="scolapro-page-title">Academic analysis</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Performance analysis from canonical academic results. Official results are the default analysis basis.</p>
      </header>

      <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="scolapro-section-title">Results analysis</h2>
            <p className="scolapro-section-description">{year} · Term {term} · {basis === "official" ? "Official" : "Provisional"}</p>
          </div>
          <div className="flex items-center gap-2"><Link href={`/academics/analysis/print?${exportParams.toString()}`} className="min-h-9 rounded-[var(--radius-xs)] border border-border px-3 py-2 text-xs font-medium">Print / PDF</Link><Link href={`/academics/analysis/export.xlsx?${exportParams.toString()}`} className="min-h-9 rounded-[var(--radius-xs)] border border-border px-3 py-2 text-xs font-medium">Export Excel</Link><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs font-medium text-foreground">{basis === "official" ? "OFFICIAL" : "PROVISIONAL"}</span></div>
        </div>
      </section>

      <AcademicAnalysisFilters
        year={year}
        term={term}
        basis={basis}
        grade={params.grade ?? ""}
        className={params.class ?? ""}
        subject={params.subject ?? ""}
        teacher={params.teacher ?? ""}
        options={workspace.filterOptions}
      />

      {basis === "provisional" ? <div role="status" className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><strong>Provisional analysis.</strong> These values are calculated from current working assessment evidence and are not approved official results.</div> : null}

      {workspace.rows.length ? <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Subjects", workspace.subjectSummaries.length],
          ["Grades", workspace.gradeSummaries.length],
          ["Classes", workspace.classSummaries.length],
          ["Teachers", workspace.teacherSummaries.length],
        ].map(([label, value]) => <div key={label} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
      </section> : null}

      {workspace.rows.length ? <section className="space-y-3">
        <div><h2 className="scolapro-section-title">Grade analysis</h2><p className="scolapro-section-description">Selected-basis performance grouped by grade.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{workspace.gradeSummaries.map((row) => <article key={row.key} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><h3 className="font-medium">{row.key}</h3><p className="mt-2 text-sm">{row.summary.assessedLearners} assessed · Average {row.summary.average ?? "—"} · Median {row.summary.median ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">Pass {row.summary.passRate == null ? "—" : row.summary.passRate + "%"} · Fail {row.summary.failRate == null ? "—" : row.summary.failRate + "%"}</p></article>)}</div>
      </section> : null}

      {workspace.rows.length ? <section className="space-y-3">
        <div><h2 className="scolapro-section-title">Class analysis</h2><p className="scolapro-section-description">Selected-basis performance grouped by historical register class.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{workspace.classSummaries.map((row) => <article key={row.key} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><h3 className="font-medium">{row.key}</h3><p className="mt-2 text-sm">{row.summary.assessedLearners} assessed · Average {row.summary.average ?? "—"} · Median {row.summary.median ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">Pass {row.summary.passRate == null ? "—" : row.summary.passRate + "%"} · Fail {row.summary.failRate == null ? "—" : row.summary.failRate + "%"}</p></article>)}</div>
      </section> : null}

      {workspace.rows.length ? <section className="space-y-3">
        <div><h2 className="scolapro-section-title">Teacher–subject analysis</h2><p className="scolapro-section-description">Descriptive results by historical teacher attribution. No ranking or competence score is applied.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workspace.teacherSummaries.map((row) => <article key={row.key} className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4"><h3 className="font-medium">{row.key}</h3><dl className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Assessed</dt><dd>{row.summary.assessedLearners}</dd></div><div><dt className="text-xs text-muted-foreground">Average</dt><dd>{row.summary.average ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Pass %</dt><dd>{row.summary.passRate == null ? "—" : row.summary.passRate + "%"}</dd></div></dl></article>)}</div>
      </section> : null}

      {workspace.rows.length ? <section className="space-y-3">
        <div><h2 className="scolapro-section-title">Subject summary</h2><p className="scolapro-section-description">Descriptive performance by subject from the selected analysis basis.</p></div>
        <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-surface-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Assessed</th><th className="px-3 py-2">Average</th><th className="px-3 py-2">Median</th><th className="px-3 py-2">Pass %</th><th className="px-3 py-2">Fail %</th></tr></thead><tbody className="divide-y divide-border-subtle">{workspace.subjectSummaries.map((row) => <tr key={row.key}><td className="px-3 py-2 font-medium">{row.key}</td><td className="px-3 py-2">{row.summary.assessedLearners}</td><td className="px-3 py-2">{row.summary.average ?? "—"}</td><td className="px-3 py-2">{row.summary.median ?? "—"}</td><td className="px-3 py-2">{row.summary.passRate == null ? "—" : row.summary.passRate + "%"}</td><td className="px-3 py-2">{row.summary.failRate == null ? "—" : row.summary.failRate + "%"}</td></tr>)}</tbody></table></div>
      </section> : null}

      {!workspace.rows.length ? (
        <section className="rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center">
          <h2 className="scolapro-section-title">No official results available</h2>
          <p className="mt-1 text-sm text-muted-foreground">{basis === "official" ? "No locked official results are available for this year and term. Provisional assessment data is not mixed into this report." : "No complete provisional subject results are currently calculable for this year and term."}</p>
        </section>
      ) : (
        <section className="space-y-3">
          <div>
            <h2 className="scolapro-section-title">Symbol distribution</h2>
            <p className="scolapro-section-description">Bands and pass classification come from the grading-scale version stored with each official result.</p>
          </div>
          <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-muted text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Teacher</th><th className="px-3 py-2">Assessed</th><th className="px-3 py-2">Average</th><th className="px-3 py-2">Median</th><th className="px-3 py-2">Pass %</th><th className="px-3 py-2">Fail %</th><th className="px-3 py-2">Symbols</th></tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {workspace.rows.map((row) => <tr key={row.subjectOfferingId}>
                  <td className="px-3 py-2">{row.grade}</td><td className="px-3 py-2">{row.className ?? "—"}</td><td className="px-3 py-2 font-medium">{row.subject}</td><td className="px-3 py-2">{row.teacher ?? "Not attributable"}{row.teacherAttribution === "multiple_assessment_allocations" ? <span className="ml-1 text-xs text-muted-foreground">(handover/shared)</span> : null}</td>
                  <td className="px-3 py-2">{row.summary.assessedLearners}</td><td className="px-3 py-2">{row.summary.average ?? "—"}</td>
                  <td className="px-3 py-2">{row.summary.median ?? "—"}</td><td className="px-3 py-2">{row.summary.passRate == null ? "—" : row.summary.passRate + "%"}</td>
                  <td className="px-3 py-2">{row.summary.failRate == null ? "—" : row.summary.failRate + "%"}</td>
                  <td className="px-3 py-2">{row.summary.symbolDistribution.length ? row.summary.symbolDistribution.map((band) => `${band.symbol} ${band.count}`).join(" · ") : "No grading bands resolved"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {!workspace.qualityConfigured ? <p className="text-xs text-muted-foreground">Quality-symbol metric: Not configured. ScolaPro does not assume A–C or another quality band.</p> : null}
        </section>
      )}
    </main>
  );
}
