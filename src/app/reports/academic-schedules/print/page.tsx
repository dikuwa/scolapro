import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ACADEMIC_SCHEDULE_TYPES, getAcademicSchedulePayload, getAcademicScheduleSnapshot, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";
import { getLiveSchoolDocumentHeader, resolveFrozenOfficialDocumentHeaderAssets } from "@/features/documents/server/live-school-document-profile";

function typeOf(value:string|undefined):AcademicScheduleType{return ACADEMIC_SCHEDULE_TYPES.includes(value as AcademicScheduleType)?value as AcademicScheduleType:"term_schedule";}

export default async function AcademicSchedulePrintPage({searchParams}:{searchParams:Promise<{year?:string;term?:string;basis?:string;type?:string;snapshot?:string}>}){
  const params=await searchParams;
  const frozen=params.snapshot ? await getAcademicScheduleSnapshot(params.snapshot) : null;
  if(params.snapshot && !frozen) notFound();
  const year=Number(params.year)||new Date().getFullYear();
  const term=Math.min(6,Math.max(1,Number(params.term)||1));
  const basis=params.basis==="provisional"?"provisional":"official";
  const scheduleType=typeOf(params.type);
  const payload=frozen?.payload ?? await getAcademicSchedulePayload({academicYear:year,termNumber:term,basis,scheduleType});
  if(!payload)redirect("/");
  const context=await import("@/lib/auth/get-user-context").then((m)=>m.getUserContext());
  if(!context.currentSchoolMembership)redirect("/");
  if(frozen && !frozen.header) notFound();
  const header=frozen?.header
    ? await resolveFrozenOfficialDocumentHeaderAssets(frozen.header)
    : await getLiveSchoolDocumentHeader(context.currentSchoolMembership.schoolId,"internal_school");
  const displayYear=payload.academicYear;
  const displayTerm=payload.termNumber;
  const displayBasis=payload.basis;

  return <main className="mx-auto max-w-[1200px] bg-white p-6 text-black print:max-w-none print:p-0">
    <style>{`@media print {.print-hide{display:none!important}.schedule-footer{position:fixed;bottom:0;left:0;right:0}.page-number:after{content:counter(page)}} @page{margin:14mm}`}</style>
    <div className="print-hide mb-4 flex justify-between gap-3 text-sm"><Link href="/reports/academic-schedules" className="underline">Back to schedules</Link><span>Use Print to print or save as PDF.</span></div>
    <header className="grid grid-cols-[84px_1fr_auto] items-center gap-4 border-b-2 border-black pb-3">
      <div className="grid size-20 place-items-center">{header.logoUrl?<img src={header.logoUrl} alt={header.schoolName+" logo"} className="max-h-20 max-w-20 object-contain"/>:null}</div>
      <div className="text-center"><h1 className="text-2xl font-semibold">{header.schoolName}</h1>{header.contactLines.map((line)=><div key={line.key} className="text-[10px]">{line.text}</div>)}</div>
      <div className="min-w-[220px] text-right text-xs"><p className="font-semibold">{payload.title}</p><p>Academic year {displayYear} · Term {displayTerm}</p><p className="font-semibold">{displayBasis.toUpperCase()}</p>{frozen?<><p>Issued version v{frozen.version} · {frozen.status.toUpperCase()}</p><p>Finalized {new Date(frozen.finalizedAt).toLocaleString("en-NA")}</p></>:<p>{new Date(payload.generatedAt).toLocaleString("en-NA")}</p>}</div>
    </header>
    {displayBasis==="provisional"?<p className="my-3 border border-black p-2 text-xs font-semibold">PROVISIONAL — not finalized official schedule evidence.</p>:null}
    {frozen?.status==="superseded"?<div className="my-3 border-2 border-black p-2 text-xs"><p className="font-bold">SUPERSEDED — retained historical version; not the current official schedule.</p>{frozen.supersessionReason?<p>Correction reason: {frozen.supersessionReason}</p>:null}</div>:null}
    <table className="mt-4 w-full border-collapse text-[10px]"><thead><tr>{payload.columns.map((column)=><th key={column} className="border border-black p-1.5 text-left">{column}</th>)}</tr></thead><tbody>{payload.rows.map((row,index)=><tr key={index}>{payload.columns.map((column)=><td key={column} className="border border-black p-1.5">{row[column]??"—"}</td>)}</tr>)}</tbody></table>
    {!payload.rows.length?<p className="mt-6 text-center text-sm">No canonical rows available.</p>:null}
    <footer className="schedule-footer border-t border-black bg-white pt-1 text-[9px]"><span>{payload.sourceDescription}</span><span className="float-right">Page <span className="page-number"/></span></footer>
  </main>;
}
