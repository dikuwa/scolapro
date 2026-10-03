import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { AcademicAnalysisFilters } from "@/features/academics/components/academic-analysis-filters";
import { AcademicAnalysisViews } from "@/features/academics/components/academic-analysis-views";
import type { AcademicAnalysisView } from "@/features/academics/server/academic-analysis";
import { getAcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function AcademicAnalysisPage({ searchParams }: { searchParams: Promise<{ year?: string; term?: string; basis?: string; grade?: string; class?: string; subject?: string; teacher?: string; view?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  if (context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const role = context.currentSchoolMembership.roleKey;
  if (!["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"].includes(role)) redirect("/");

  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();
  const term = Math.min(3, Math.max(1, Number(params.term) || 1));
  const basis = params.basis === "provisional" ? "provisional" : "official";
  const allowedViews: AcademicAnalysisView[] = ["overview","results","grades","learners","trends"];
  const view: AcademicAnalysisView = allowedViews.includes(params.view as AcademicAnalysisView) ? params.view as AcademicAnalysisView : "overview";
  const className = view === "trends" ? undefined : params.class;
  const teacher = view === "trends" ? undefined : params.teacher;
  const workspace = await getAcademicAnalysisWorkspace({ academicYear: year, termNumber: term, basis, grade: params.grade, className, subjectOfferingId: params.subject, teacher });
  if (!workspace) redirect("/");
  const exportParams = new URLSearchParams({ year: String(year), term: String(term), basis, view });
  if (params.grade) exportParams.set("grade", params.grade);
  if (className) exportParams.set("class", className);
  if (params.subject) exportParams.set("subject", params.subject);
  if (teacher) exportParams.set("teacher", teacher);

  return (
    <AppShell>
      <div className="space-y-5">
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
        className={className ?? ""}
        subject={params.subject ?? ""}
        teacher={teacher ?? ""}
        options={workspace.filterOptions}
      />

      {basis === "provisional" ? <div role="status" className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><strong>Provisional analysis.</strong> These values are calculated from current working assessment evidence and are not approved official results.</div> : null}
      {view === "trends" ? <div role="status" className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-4 py-3 text-sm text-muted-foreground"><strong className="text-foreground">Offering-wide trends.</strong> Class and teacher filters are intentionally not applied because the governed official-series comparator does not provide class/teacher-scoped comparisons.</div> : null}

      <nav className="flex gap-2 overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-2" aria-label="Academic analysis views">
        {([
          ["overview","Overview"],
          ["results","Results"],
          ["grades","Grades & Classes"],
          ["learners","Learners & Risk"],
          ["trends","Trends"],
        ] as Array<[AcademicAnalysisView,string]>).map(([value,label]) => {
          const query = new URLSearchParams(exportParams);
          query.set("view", value);
          return <Link key={value} href={"/academics/analysis?" + query.toString()} className={"whitespace-nowrap rounded-[var(--radius-xs)] px-3 py-2 text-sm font-medium " + (view === value ? "bg-brand text-white" : "text-muted-foreground hover:bg-surface-muted")}>{label}</Link>;
        })}
      </nav>

      <AcademicAnalysisViews workspace={workspace} view={view} />
      </div>
    </AppShell>
  );
}
