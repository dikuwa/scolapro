import Link from "next/link";
import { redirect } from "next/navigation";
import { getAcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";

export default async function AcademicAnalysisPrintPage({ searchParams }: { searchParams: Promise<{ year?: string; term?: string; basis?: string; grade?: string; class?: string; subject?: string; teacher?: string }> }) {
  const params = await searchParams;
  const academicYear = Number(params.year) || new Date().getFullYear();
  const termNumber = Math.min(3, Math.max(1, Number(params.term) || 1));
  const basis = params.basis === "provisional" ? "provisional" : "official";
  const workspace = await getAcademicAnalysisWorkspace({ academicYear, termNumber, basis, grade: params.grade, className: params.class, subjectOfferingId: params.subject, teacher: params.teacher });
  if (!workspace) redirect("/");

  return <main className="mx-auto max-w-[1100px] space-y-4 bg-white p-6 text-black print:max-w-none print:p-0">
    <div className="flex justify-between gap-4 print:hidden"><Link href="/academics/analysis" className="text-sm underline">Back to analysis</Link><p className="text-sm">Use your browser Print command to print or save this report as PDF.</p></div>
    <header className="border-b border-black pb-3">
      <h1 className="text-xl font-semibold">Academic Analysis — Symbol Distribution</h1>
      <p className="text-sm">Academic year {academicYear} · Term {termNumber} · {basis === "official" ? "OFFICIAL" : "PROVISIONAL"}</p>
      {basis === "provisional" ? <p className="mt-2 text-sm font-semibold">PROVISIONAL — calculated from current working assessment evidence; not approved official results.</p> : null}
    </header>
    <table className="w-full border-collapse text-xs">
      <thead><tr>{["Grade","Class","Subject","Teacher","Assessed","Average","Median","Pass %","Fail %","Symbols"].map((heading) => <th key={heading} className="border border-black p-1.5 text-left">{heading}</th>)}</tr></thead>
      <tbody>{workspace.exportRows.map((row, index) => <tr key={index}>
        {[row.grade,row.className || "—",row.subject,row.teacher || "—",row.assessed,row.average ?? "—",row.median ?? "—",row.passRate == null ? "—" : row.passRate + "%",row.failRate == null ? "—" : row.failRate + "%",row.symbols || "—"].map((value, cell) => <td key={cell} className="border border-black p-1.5 align-top">{value}</td>)}
      </tr>)}</tbody>
    </table>
    <footer className="border-t border-black pt-2 text-[10px]">Generated from the same governed Academic Analysis dataset shown in ScolaPro. Basis: {basis.toUpperCase()}.</footer>
  </main>;
}
