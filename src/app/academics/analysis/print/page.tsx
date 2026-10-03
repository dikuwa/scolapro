import Link from "next/link";
import { redirect } from "next/navigation";
import type { AcademicAnalysisView } from "@/features/academics/server/academic-analysis";
import { getAcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";

const VIEW_LABELS: Record<AcademicAnalysisView,string> = {
  overview: "Overview",
  results: "Results",
  grades: "Grades & Classes",
  learners: "Learners & Risk",
  trends: "Trends",
};

function pct(value: number | null) {
  return value == null ? "—" : String(value) + "%";
}

export default async function AcademicAnalysisPrintPage({ searchParams }: { searchParams: Promise<{ year?: string; term?: string; basis?: string; grade?: string; class?: string; subject?: string; teacher?: string; view?: string }> }) {
  const params = await searchParams;
  const academicYear = Number(params.year) || new Date().getFullYear();
  const termNumber = Math.min(3, Math.max(1, Number(params.term) || 1));
  const basis = params.basis === "provisional" ? "provisional" : "official";
  const allowedViews: AcademicAnalysisView[] = ["overview","results","grades","learners","trends"];
  const view: AcademicAnalysisView = allowedViews.includes(params.view as AcademicAnalysisView) ? params.view as AcademicAnalysisView : "overview";
  const workspace = await getAcademicAnalysisWorkspace({ academicYear, termNumber, basis, grade: params.grade, className: params.class, subjectOfferingId: params.subject, teacher: params.teacher });
  if (!workspace) redirect("/");
  const header = await getLiveSchoolDocumentHeader(workspace.schoolId, "internal_school");

  return <main className="mx-auto max-w-[1100px] space-y-4 bg-white p-6 text-black print:max-w-none print:p-0">
    <div className="flex justify-between gap-4 print:hidden"><Link href="/academics/analysis" className="text-sm underline">Back to analysis</Link><p className="text-sm">Use your browser Print command to print or save this report as PDF.</p></div>

    <header className="grid grid-cols-[96px_1fr_auto] items-center gap-4 border-b-2 border-black pb-3">
      <div className="grid size-24 place-items-center">{header.logoUrl ? <img src={header.logoUrl} alt={header.schoolName + " logo"} className="max-h-24 max-w-24 object-contain" /> : null}</div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{header.schoolName}</h1>
        {header.contactLines.length ? <div className="mt-1 text-[10px]">{header.contactLines.map((line) => <div key={line.key}>{line.text}</div>)}</div> : null}
      </div>
      <div className="min-w-[220px] text-right text-xs">
        <p className="font-semibold">Academic Analysis — {VIEW_LABELS[view]}</p>
        <p>Academic year {academicYear} · Term {termNumber}</p>
        <p className="font-semibold">{basis === "official" ? "OFFICIAL" : "PROVISIONAL"}</p>
      </div>
    </header>

    {basis === "provisional" ? <p className="border border-black p-2 text-xs font-semibold">PROVISIONAL — calculated from current working assessment evidence; not approved official results.</p> : null}

    {view === "overview" ? <>
      <section className="grid grid-cols-4 gap-2 text-xs">
        {[
          ["Learners analysed", workspace.learnerRiskRows.length],
          ["High risk", workspace.learnerRiskRows.filter((row) => row.riskLevel === "high").length],
          ["2+ failures", workspace.learnerRiskRows.filter((row) => row.failedSubjects >= 2).length],
          ["Near threshold", workspace.learnerRiskRows.filter((row) => row.nearThresholdSubjects > 0).length],
        ].map(([label,value]) => <div key={String(label)} className="border border-black p-2"><div className="font-semibold">{label}</div><div className="mt-1 text-lg">{value}</div></div>)}
      </section>
      <section><h2 className="mb-2 font-semibold">Top achievers</h2><table className="w-full border-collapse text-xs"><thead><tr>{["Learner","Grade/Class","Average"].map((h)=><th key={h} className="border border-black p-1.5 text-left">{h}</th>)}</tr></thead><tbody>{workspace.topLearners.map((row)=><tr key={row.enrolmentId}><td className="border border-black p-1.5">{row.learnerName}</td><td className="border border-black p-1.5">{row.grade} · {row.className}</td><td className="border border-black p-1.5">{row.average ?? "—"}</td></tr>)}</tbody></table></section>
    </> : null}

    {view === "results" ? <table className="w-full border-collapse text-xs"><thead><tr>{["Grade","Class","Subject","Teacher","Assessed","Average","Pass %","Fail %","Quality %","Symbols"].map((h)=><th key={h} className="border border-black p-1.5 text-left">{h}</th>)}</tr></thead><tbody>{workspace.rows.map((row,index)=><tr key={index}><td className="border border-black p-1.5">{row.grade}</td><td className="border border-black p-1.5">{row.className ?? "—"}</td><td className="border border-black p-1.5">{row.subject}</td><td className="border border-black p-1.5">{row.teacher ?? "—"}</td><td className="border border-black p-1.5">{row.summary.assessedLearners}</td><td className="border border-black p-1.5">{row.summary.average ?? "—"}</td><td className="border border-black p-1.5">{pct(row.summary.passRate)}</td><td className="border border-black p-1.5">{pct(row.summary.failRate)}</td><td className="border border-black p-1.5">{pct(row.summary.qualityRate)}</td><td className="border border-black p-1.5">{row.summary.symbolDistribution.map((band)=>band.symbol + " " + band.count).join(" · ") || "—"}</td></tr>)}</tbody></table> : null}

    {view === "grades" ? <div className="grid grid-cols-2 gap-4">
      {([["Grades",workspace.gradeSummaries],["Classes",workspace.classSummaries]] as const).map(([title,rows]) => <section key={title}><h2 className="mb-2 font-semibold">{title}</h2><table className="w-full border-collapse text-xs"><thead><tr>{["Group","Assessed","Average","Pass %","Fail %"].map((h)=><th key={h} className="border border-black p-1.5 text-left">{h}</th>)}</tr></thead><tbody>{rows.map((row)=><tr key={row.key}><td className="border border-black p-1.5">{row.label}</td><td className="border border-black p-1.5">{row.summary.assessedLearners}</td><td className="border border-black p-1.5">{row.summary.average ?? "—"}</td><td className="border border-black p-1.5">{pct(row.summary.passRate)}</td><td className="border border-black p-1.5">{pct(row.summary.failRate)}</td></tr>)}</tbody></table></section>)}
    </div> : null}

    {view === "learners" ? <table className="w-full border-collapse text-xs"><thead><tr>{["Learner","Adm. no.","Grade/Class","Average","Failures","Promotional","Near threshold","Promotion readiness","Risk"].map((h)=><th key={h} className="border border-black p-1.5 text-left">{h}</th>)}</tr></thead><tbody>{workspace.learnerRiskRows.map((row)=><tr key={row.enrolmentId}><td className="border border-black p-1.5">{row.learnerName}</td><td className="border border-black p-1.5">{row.admissionNumber || "—"}</td><td className="border border-black p-1.5">{row.grade} · {row.className}</td><td className="border border-black p-1.5">{row.average ?? "—"}</td><td className="border border-black p-1.5">{row.failedSubjects}</td><td className="border border-black p-1.5">{row.promotionalSubjectFailures}</td><td className="border border-black p-1.5">{row.nearThresholdSubjects}</td><td className="border border-black p-1.5">{row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status}</td><td className="border border-black p-1.5">{row.riskLevel}</td></tr>)}</tbody></table> : null}

    {view === "trends" ? <table className="w-full border-collapse text-xs"><thead><tr>{["Grade","Subject","Term-on-term","Year-on-year","Comparability"].map((h)=><th key={h} className="border border-black p-1.5 text-left">{h}</th>)}</tr></thead><tbody>{workspace.trends.map((row)=><tr key={row.subjectOfferingId}><td className="border border-black p-1.5">{row.grade}</td><td className="border border-black p-1.5">{row.subject}</td><td className="border border-black p-1.5">{row.termOnTerm.passRateDelta == null ? "—" : String(row.termOnTerm.passRateDelta) + " pp"}</td><td className="border border-black p-1.5">{row.yearOnYear.passRateDelta == null ? "—" : String(row.yearOnYear.passRateDelta) + " pp"}</td><td className="border border-black p-1.5">{[row.termOnTerm.reason,row.yearOnYear.reason].filter(Boolean).join(" · ") || "Comparable governed series"}</td></tr>)}</tbody></table> : null}

    <footer className="border-t border-black pt-2 text-[10px]">Generated from the governed Academic Analysis dataset shown in ScolaPro. Basis: {basis.toUpperCase()} · View: {VIEW_LABELS[view]}.</footer>
  </main>;
}
