import Link from "next/link";
import { redirect } from "next/navigation";
import { History, Printer, Sheet } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { getReportCardAcademicTerm } from "@/features/reporting/server/report-card-academic-term";
import { getReportCardAcademicYear } from "@/features/reporting/server/report-card-academic-year";
import {
  ACADEMIC_SCHEDULE_LABELS,
  ACADEMIC_SCHEDULE_TYPES,
  getAcademicScheduleHistory,
  getAcademicSchedulePayload,
  type AcademicScheduleBasis,
  type AcademicScheduleType,
} from "@/features/reporting/server/academic-schedules";
import { getUserContext } from "@/lib/auth/get-user-context";
import { AcademicScheduleFilters } from "@/features/reporting/academic-schedule-filters";
import { AcademicScheduleFinalizeForm } from "@/features/reporting/academic-schedule-finalize-form";

function validType(value: string | undefined): AcademicScheduleType {
  return ACADEMIC_SCHEDULE_TYPES.includes(value as AcademicScheduleType) ? value as AcademicScheduleType : "term_schedule";
}

export default async function AcademicSchedulesPage({ searchParams }: { searchParams: Promise<{year?:string;term?:string;basis?:string;type?:string}> }) {
  const context=await getUserContext();
  if(!context.user) redirect("/login?next=/reports/academic-schedules");
  if(context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const membership=context.currentSchoolMembership;
  if(!["school_admin","principal","deputy_principal"].includes(membership.roleKey)) redirect("/");

  const params=await searchParams;
  const defaultYear=await getReportCardAcademicYear(membership.schoolId);
  const year=Number(params.year)||defaultYear;
  const defaultTerm=await getReportCardAcademicTerm(membership.schoolId,year);
  const term=Math.min(6,Math.max(1,Number(params.term)||defaultTerm));
  const basis:AcademicScheduleBasis=params.basis==="provisional"?"provisional":"official";
  const scheduleType=validType(params.type);
  const [payload,history]=await Promise.all([
    getAcademicSchedulePayload({academicYear:year,termNumber:term,basis,scheduleType}),
    getAcademicScheduleHistory({academicYear:year,termNumber:term,scheduleType}),
  ]);
  if(!payload) redirect("/");

  const query=new URLSearchParams({year:String(year),term:String(term),basis,type:scheduleType});

  return <AppShell><section className="space-y-5">
    <header>
      <h1 className="scolapro-page-title">Official academic schedules</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Preview school academic schedules from canonical ScolaPro results, assessment readiness and promotion-readiness data. Finalized official snapshots are immutable and versioned.</p>
    </header>

    <AcademicScheduleFilters
      scheduleType={scheduleType}
      academicYear={year}
      termNumber={term}
      basis={basis}
      scheduleOptions={ACADEMIC_SCHEDULE_TYPES.map((type)=>({value:type,label:ACADEMIC_SCHEDULE_LABELS[type]}))}
    />

    {basis==="provisional"?<div className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><strong>PROVISIONAL.</strong> This preview uses current governed working evidence and cannot be finalized as official schedule history.</div>:null}
    <div className="rounded-[var(--radius-sm)] border border-warning/30 bg-warning/10 px-4 py-3 text-sm"><strong>Template fidelity pending.</strong> Functional schedule output is available, but official sample templates must be attached before visual/template fidelity is declared complete.</div>

    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
        <div><h2 className="scolapro-section-title">{payload.title}</h2><p className="scolapro-section-description">{year} · Term {term} · {basis.toUpperCase()} · {payload.rowCount} row{payload.rowCount===1?"":"s"}</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href={"/reports/academic-schedules/print?"+query.toString()} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] border border-border px-3 py-2 text-xs font-medium"><Printer className="size-3.5"/>Print / PDF</Link>
          <Link href={"/reports/academic-schedules/export.xlsx?"+query.toString()} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] border border-border px-3 py-2 text-xs font-medium"><Sheet className="size-3.5"/>Excel</Link>
          {basis==="official"?<AcademicScheduleFinalizeForm academicYear={year} termNumber={term} scheduleType={scheduleType} replacingFinalizedVersion={history.some((row)=>row.status==="finalized")}/>:null}
        </div>
      </div>
      {payload.rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface-muted text-xs text-muted-foreground"><tr>{payload.columns.map((column)=><th key={column} className="px-3 py-2">{column}</th>)}</tr></thead><tbody className="divide-y divide-border-subtle">{payload.rows.map((row,index)=><tr key={index}>{payload.columns.map((column)=><td key={column} className="px-3 py-2">{row[column]??"—"}</td>)}</tr>)}</tbody></table></div>:<div className="p-8 text-center text-sm text-muted-foreground">No canonical rows are available for this schedule, year, term and basis.</div>}
      <div className="border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground">{payload.sourceDescription}</div>
    </section>

    <section className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-2"><History className="size-4"/><h2 className="scolapro-section-title">Version history</h2></div>
      {history.length?<div className="mt-3 space-y-2">{history.map((row)=><div key={row.id} className="rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>v{row.version} · {row.status}</span><span className="text-xs text-muted-foreground">{new Date(row.finalizedAt).toLocaleString("en-NA")}</span></div>{row.supersessionReason?<p className="mt-1 text-xs text-muted-foreground">Superseded: {row.supersessionReason}</p>:null}<div className="mt-2 flex gap-2"><Link href={"/reports/academic-schedules/print?snapshot="+row.id} className="text-xs font-medium underline">Open issued version</Link><Link href={"/reports/academic-schedules/export.xlsx?snapshot="+row.id} className="text-xs font-medium underline">Excel</Link></div></div>)}</div>:<p className="mt-3 text-sm text-muted-foreground">No finalized versions yet.</p>}
    </section>
  </section></AppShell>;
}
