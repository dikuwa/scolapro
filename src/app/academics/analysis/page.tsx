import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function AcademicAnalysisPage({ searchParams }: { searchParams: Promise<{ year?: string; term?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  if (context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const role = context.currentSchoolMembership.roleKey;
  if (!["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"].includes(role)) redirect("/");

  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();
  const term = Math.min(6, Math.max(1, Number(params.term) || 1));
  const workspace = await getAcademicAnalysisWorkspace({ academicYear: year, termNumber: term, basis: "official" });
  if (!workspace) redirect("/");

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
            <p className="scolapro-section-description">{year} · Term {term} · Official</p>
          </div>
          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs font-medium text-foreground">OFFICIAL</span>
        </div>
      </section>

      {!workspace.rows.length ? (
        <section className="rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center">
          <h2 className="scolapro-section-title">No official results available</h2>
          <p className="mt-1 text-sm text-muted-foreground">No locked official results are available for this year and term. Provisional assessment data is not mixed into this report.</p>
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
                <tr><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Assessed</th><th className="px-3 py-2">Average</th><th className="px-3 py-2">Median</th><th className="px-3 py-2">Pass %</th><th className="px-3 py-2">Fail %</th><th className="px-3 py-2">Symbols</th></tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {workspace.rows.map((row) => <tr key={row.subjectOfferingId}>
                  <td className="px-3 py-2">{row.grade}</td><td className="px-3 py-2">{row.className ?? "—"}</td><td className="px-3 py-2 font-medium">{row.subject}</td>
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
