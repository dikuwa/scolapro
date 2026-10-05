import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleSlash2, History } from "lucide-react";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { OfficialDocumentPreview } from "@/components/documents/official-document-preview";
import { AppShell } from "@/components/shell/app-shell";
import { getReportCardAcademicTerm } from "@/features/reporting/server/report-card-academic-term";
import { getReportCardAcademicYear } from "@/features/reporting/server/report-card-academic-year";
import { getAcademicScheduleFilterOptions, getAcademicScheduleHistory, getAcademicSchedulePayload, type AcademicScheduleBasis, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";
import { getUserContext } from "@/lib/auth/get-user-context";
import { AcademicScheduleFilters, type OfficialScheduleDocument } from "@/features/reporting/academic-schedule-filters";
import { AcademicScheduleFinalizeForm } from "@/features/reporting/academic-schedule-finalize-form";

const ANALYSIS_COMPAT:Record<string,string>={
  retention_at_risk:"learners",
  incomplete_results:"results",
  subject_failure:"results",
  top_achievers:"overview",
  class_grade_summary:"grades",
  promotion_exceptions:"promotion_exceptions",
};

function SummaryCard({label,value,helper}:{label:string;value:string;helper:string}) {
  return <article className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-base font-semibold">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
  </article>;
}

export default async function AcademicSchedulesPage({ searchParams }: { searchParams: Promise<{year?:string;term?:string;period?:string;basis?:string;type?:string;document?:string;grade?:string;class?:string;classes?:string}> }) {
  const context=await getUserContext();
  if(!context.user) redirect("/login?next=/reports/academic-schedules");
  if(context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const membership=context.currentSchoolMembership;
  if(!["school_admin","principal","deputy_principal"].includes(membership.roleKey)) redirect("/");

  const params=await searchParams;
  if(params.type && ANALYSIS_COMPAT[params.type]) {
    const bridge=new URLSearchParams();
    if(params.year) bridge.set("year",params.year);
    if(params.term) bridge.set("term",params.term);
    if(params.basis) bridge.set("basis",params.basis);
    if(params.grade) bridge.set("grade",params.grade);
    if(params.class) bridge.set("class",params.class);
    bridge.set("view",ANALYSIS_COMPAT[params.type]);
    redirect("/academics/analysis?"+bridge.toString());
  }

  const defaultYear=await getReportCardAcademicYear(membership.schoolId);
  const year=Number(params.year)||defaultYear;
  const filterOptions=await getAcademicScheduleFilterOptions(year);
  if(!filterOptions.grades.length) redirect("/assessment");
  const requestedGrade=params.grade??"";
  const requestedGradeOption=filterOptions.grades.find((grade)=>grade.value===requestedGrade||grade.label===requestedGrade||grade.code===requestedGrade);
  if(requestedGrade&&!requestedGradeOption) notFound();
  const gradeId=requestedGradeOption?.value??filterOptions.grades[0].value;
  const classOptions=filterOptions.classesByGrade[gradeId]??[];
  const rawClassScope=(params.classes??"").split(",").map((value)=>value.trim()).filter(Boolean);
  const classIds=[...new Set(rawClassScope.map((value)=>classOptions.find((row)=>row.value===value||row.label===value||row.code===value)?.value).filter((value):value is string=>Boolean(value)))].sort();
  if(rawClassScope.length&&classIds.length!==new Set(rawClassScope).size) notFound();

  const defaultTerm=await getReportCardAcademicTerm(membership.schoolId,year);
  const legacyAllTerms=params.type==="promotion_all_terms";
  const document:OfficialScheduleDocument=params.document==="all_results"||params.type==="term_schedule"?"all_results":"promotion";
  const period=document==="promotion"&&(params.period==="all"||legacyAllTerms)
    ?"all"
    :String(Math.min(6,Math.max(1,Number(params.period??params.term)||defaultTerm)));
  const term=period==="all"?(filterOptions.terms.at(-1)?.number??defaultTerm):Number(period);
  const basis:AcademicScheduleBasis=params.basis==="provisional"?"provisional":"official";
  const scheduleType:AcademicScheduleType=document==="all_results"?"term_schedule":period==="all"?"promotion_all_terms":"promotion_schedule";

  const payload=await getAcademicSchedulePayload({
    academicYear:year,
    termNumber:term,
    basis,
    scheduleType,
    gradeId,
    classIds,
  });
  if(!payload) redirect("/");

  const history=await getAcademicScheduleHistory({academicYear:year,termNumber:term,scheduleType,scopeKey:payload.scopeKey});
  const query=new URLSearchParams({year:String(year),period,basis,document,grade:gradeId});
  if(classIds.length) query.set("classes",classIds.join(","));

  const analyticsQuery=new URLSearchParams({year:String(year),term:String(term),basis:"official"});
  if(payload.grade) analyticsQuery.set("grade",payload.grade);

  const currentIssued=history.find((row)=>row.status==="finalized");
  const scopeText=payload.classNames.length?payload.classNames.join(", "):"All classes in "+(payload.grade??"grade");

  return <AppShell><section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="scolapro-page-title">Official academic schedules</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Produce governed Promotion and All Results schedules from canonical school academic records.</p>
      </div>
      <Link href={"/academics/analysis?"+analyticsQuery.toString()} className="scolapro-cta inline-flex min-h-9 items-center rounded-[var(--radius-xs)] border border-border px-3 py-2 text-xs font-medium">
        Open Academic Analysis with this scope →
      </Link>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Schedule summary">
      <SummaryCard label="Document" value={payload.title} helper={document==="promotion"?"Formal promotion record":"Formal all-results record"} />
      <SummaryCard label="Period" value={payload.periodLabel+" · "+year} helper={period==="all"?"Configured academic terms":"Governed reporting period"} />
      <SummaryCard label="Scope" value={(payload.grade??"Grade")+" · "+scopeText} helper={payload.rowCount+" rendered row"+(payload.rowCount===1?"":"s")} />
      <SummaryCard label="Status" value={basis==="official"?(currentIssued?"Official · v"+currentIssued.version:"Official · Not finalized"):"Provisional preview"} helper={basis==="official"?"Only official scope can be finalized":"Working evidence only"} />
    </section>

    <AcademicScheduleFilters document={document} academicYear={year} period={period} basis={basis} gradeId={gradeId} classIds={classIds} options={filterOptions}/>

    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]" aria-labelledby="source-readiness-title">
      <div className="mb-3">
        <h2 id="source-readiness-title" className="scolapro-section-title">Source readiness</h2>
        <p className="scolapro-section-description">Canonical inputs are shown explicitly. Missing optional source fields remain blank rather than inferred.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(payload.sourceReadiness??[]).map((item)=>{
          const Icon=item.status==="available"?CheckCircle2:item.status==="partial"?AlertTriangle:CircleSlash2;
          return <div key={item.label} className="flex gap-2 rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2">
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true"/>
            <div><p className="text-xs font-semibold">{item.label}</p><p className="text-[11px] text-muted-foreground">{item.detail}</p></div>
          </div>;
        })}
      </div>
    </section>

    {basis==="provisional"
      ? <div role="status" className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><strong>PROVISIONAL.</strong> This working preview cannot be finalized.</div>
      : period==="all"
        ? <div role="status" className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-4 py-3 text-sm text-muted-foreground"><strong className="text-foreground">All Terms scope.</strong> This multi-term issue has a distinct immutable snapshot scope and cannot supersede a single-term document.</div>
        : null}

    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
        <div>
          <h2 className="scolapro-section-title">Document preview</h2>
          <p className="scolapro-section-description">{payload.title} · {payload.grade} · {scopeText} · {payload.periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <OfficialDocumentActions
            previewHref={"/reports/academic-schedules/export.pdf?"+query.toString()+"&preview=1"}
            downloadHref={"/reports/academic-schedules/export.pdf?"+query.toString()}
            spreadsheetHref={"/reports/academic-schedules/export.xlsx?"+query.toString()}
          />
          {basis==="official"
            ? <AcademicScheduleFinalizeForm academicYear={year} termNumber={term} scheduleType={scheduleType} gradeId={gradeId} classIds={classIds} replacingFinalizedVersion={Boolean(currentIssued)}/>
            : null}
        </div>
      </div>
      <div className="bg-surface-muted px-4 py-2 text-xs text-muted-foreground">{payload.sourceDescription}</div>
      {payload.rows.length
        ? <OfficialDocumentPreview title={`${payload.title} document preview`} src={"/reports/academic-schedules/export.pdf?"+query.toString()+"&preview=1"} orientation="landscape" />
        : <div className="p-8 text-center text-sm text-muted-foreground">No canonical rows are available for this document scope.</div>}
      <div className="border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground">{payload.notes.join(" ")}</div>
    </section>

    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-2"><History className="size-4"/><h2 className="scolapro-section-title">Issued versions</h2></div>
      {history.length
        ? <div className="mt-3 space-y-2">{history.map((row)=><div key={row.id} className="rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>v{row.version} · {row.status}</span><span className="text-xs text-muted-foreground">{new Date(row.finalizedAt).toLocaleString("en-NA")}</span></div>{row.supersessionReason?<p className="mt-1 text-xs text-muted-foreground">Superseded: {row.supersessionReason}</p>:null}<div className="mt-2"><OfficialDocumentActions compact previewHref={"/reports/academic-schedules/export.pdf?snapshot="+row.id+"&preview=1"} downloadHref={"/reports/academic-schedules/export.pdf?snapshot="+row.id} spreadsheetHref={"/reports/academic-schedules/export.xlsx?snapshot="+row.id} /></div></div>)}</div>
        : <p className="mt-3 text-sm text-muted-foreground">No finalized version exists for this document scope.</p>}
    </section>
  </section></AppShell>;
}
