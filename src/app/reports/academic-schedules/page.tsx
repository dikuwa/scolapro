import Link from "next/link";
import { redirect } from "next/navigation";
import { History, Printer, Sheet } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { getReportCardAcademicTerm } from "@/features/reporting/server/report-card-academic-term";
import { getReportCardAcademicYear } from "@/features/reporting/server/report-card-academic-year";
import { getAcademicScheduleFilterOptions, getAcademicScheduleHistory, getAcademicSchedulePayload, type AcademicScheduleBasis, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";
import { getUserContext } from "@/lib/auth/get-user-context";
import { AcademicScheduleFilters, type OfficialScheduleDocument } from "@/features/reporting/academic-schedule-filters";
import { AcademicScheduleFinalizeForm } from "@/features/reporting/academic-schedule-finalize-form";

const ANALYSIS_COMPAT:Record<string,string>={retention_at_risk:"learners",incomplete_results:"results",subject_failure:"results",top_achievers:"overview",class_grade_summary:"grades",promotion_exceptions:"learners"};

export default async function AcademicSchedulesPage({ searchParams }: { searchParams: Promise<{year?:string;term?:string;period?:string;basis?:string;type?:string;document?:string;grade?:string;classes?:string}> }) {
  const context=await getUserContext();
  if(!context.user) redirect("/login?next=/reports/academic-schedules");
  if(context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const membership=context.currentSchoolMembership;
  if(!["school_admin","principal","deputy_principal"].includes(membership.roleKey)) redirect("/");
  const params=await searchParams;
  if(params.type && ANALYSIS_COMPAT[params.type]) redirect(`/academics/analysis?view=${ANALYSIS_COMPAT[params.type]}`);
  const defaultYear=await getReportCardAcademicYear(membership.schoolId);
  const year=Number(params.year)||defaultYear;
  const filterOptions=await getAcademicScheduleFilterOptions(year);
  const defaultTerm=await getReportCardAcademicTerm(membership.schoolId,year);
  const legacyAllTerms=params.type==="promotion_all_terms";
  const document:OfficialScheduleDocument=params.document==="all_results"||params.type==="term_schedule"?"all_results":"promotion";
  const period=document==="promotion"&&(params.period==="all"||legacyAllTerms)?"all":String(Math.min(6,Math.max(1,Number(params.period??params.term)||defaultTerm)));
  const term=period==="all"?(filterOptions.terms.at(-1)?.number??defaultTerm):Number(period);
  const basis:AcademicScheduleBasis=params.basis==="provisional"?"provisional":"official";
  const grade=params.grade&&params.grade!=="all"?params.grade:"";
  const classNames=(params.classes??"").split(",").map((value)=>value.trim()).filter(Boolean);
  const scheduleType:AcademicScheduleType=document==="all_results"?"term_schedule":period==="all"?"promotion_all_terms":"promotion_schedule";
  const payload=await getAcademicSchedulePayload({academicYear:year,termNumber:term,basis,scheduleType,grade:grade||undefined,classNames});
  if(!payload) redirect("/");
  const history=await getAcademicScheduleHistory({academicYear:year,termNumber:term,scheduleType,scopeKey:payload.scopeKey});
  const query=new URLSearchParams({year:String(year),period,basis,document});
  if(grade)query.set("grade",grade);
  if(classNames.length)query.set("classes",classNames.join(","));
  const deterministicFinalScope=basis==="official";

  return <AppShell><section className="space-y-5">
    <header><h1 className="scolapro-page-title">Official academic schedules</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Promotion and all-results documents backed by canonical official results and governed school records.</p></header>
    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
        <div><h2 className="scolapro-section-title">{payload.title}</h2><p className="scolapro-section-description">{year} · {payload.periodLabel} · {payload.grade??"All grades"} · {payload.classNames.length?payload.classNames.join(", "):"All classes"} · {basis.toUpperCase()}</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href={"/reports/academic-schedules/print?"+query.toString()} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] border border-border px-3 py-2 text-xs font-medium"><Printer className="size-3.5"/>Print / PDF</Link>
          <Link href={"/reports/academic-schedules/export.xlsx?"+query.toString()} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] border border-border px-3 py-2 text-xs font-medium"><Sheet className="size-3.5"/>Excel</Link>
          {deterministicFinalScope?<AcademicScheduleFinalizeForm academicYear={year} termNumber={term} scheduleType={scheduleType} grade={grade||undefined} classNames={classNames} replacingFinalizedVersion={history.some((row)=>row.status==="finalized")}/>:null}
        </div>
      </div>
      <div className="bg-surface-muted px-4 py-2 text-xs text-muted-foreground">{payload.sourceDescription}</div>
    </section>
    <AcademicScheduleFilters document={document} academicYear={year} period={period} basis={basis} grade={grade} classNames={classNames} options={filterOptions}/>
    {basis==="provisional"?<div role="status" className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><strong>PROVISIONAL.</strong> This working preview cannot be finalized.</div>:period==="all"?<div role="status" className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-4 py-3 text-sm text-muted-foreground"><strong className="text-foreground">All Terms scope.</strong> This multi-term issue has a distinct immutable snapshot scope and cannot supersede an ordinary term document.</div>:null}
    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      {payload.rows.length?<div className="max-w-full overflow-x-auto"><table className="w-max min-w-full whitespace-nowrap text-left text-xs"><thead className="sticky top-0 bg-surface-muted text-muted-foreground"><tr>{payload.columns.map((column)=><th key={column} className="px-2 py-2 font-medium">{column}</th>)}</tr></thead><tbody className="divide-y divide-border-subtle">{payload.rows.map((row,index)=><tr key={index}>{payload.columns.map((column)=><td key={column} className="px-2 py-2">{row[column]??""}</td>)}</tr>)}{payload.footerRows?.map((row,index)=><tr key={`footer-${index}`} className="bg-surface-muted font-medium">{payload.columns.map((column)=><td key={column} className="px-2 py-2">{row[column]??""}</td>)}</tr>)}</tbody></table></div>:<div className="p-8 text-center text-sm text-muted-foreground">No canonical rows are available for this document scope.</div>}
      <div className="border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground">{payload.notes.join(" ")}</div>
    </section>
    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]"><div className="flex items-center gap-2"><History className="size-4"/><h2 className="scolapro-section-title">Issued versions</h2></div>{history.length?<div className="mt-3 space-y-2">{history.map((row)=><div key={row.id} className="rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>v{row.version} · {row.status}</span><span className="text-xs text-muted-foreground">{new Date(row.finalizedAt).toLocaleString("en-NA")}</span></div><div className="mt-2 flex gap-3"><Link href={"/reports/academic-schedules/print?snapshot="+row.id} className="text-xs font-medium underline">Open issued version</Link><Link href={"/reports/academic-schedules/export.xlsx?snapshot="+row.id} className="text-xs font-medium underline">Excel</Link></div></div>)}</div>:<p className="mt-3 text-sm text-muted-foreground">No finalized version exists for this document scope.</p>}</section>
  </section></AppShell>;
}
