import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAcademicScheduleFilterOptions, getAcademicSchedulePayload, getAcademicScheduleSnapshot, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";
import { getLiveSchoolDocumentHeader, resolveFrozenOfficialDocumentHeaderAssets } from "@/features/documents/server/live-school-document-profile";

export default async function AcademicSchedulePrintPage({searchParams}:{searchParams:Promise<{year?:string;term?:string;period?:string;basis?:string;type?:string;document?:string;grade?:string;classes?:string;snapshot?:string}>}){
  const params=await searchParams;
  const analysisCompat:Record<string,string>={retention_at_risk:"learners",incomplete_results:"results",subject_failure:"results",top_achievers:"overview",class_grade_summary:"grades",promotion_exceptions:"learners"};
  if(params.type&&analysisCompat[params.type]) redirect(`/academics/analysis/print?year=${params.year??""}&term=${params.term??""}&basis=${params.basis??"official"}&view=${analysisCompat[params.type]}`);
  const frozen=params.snapshot ? await getAcademicScheduleSnapshot(params.snapshot) : null;
  if(params.snapshot && !frozen) notFound();
  const year=Number(params.year)||new Date().getFullYear();
  const options=await getAcademicScheduleFilterOptions(year);
  const document=params.document==="all_results"||params.type==="term_schedule"?"all_results":"promotion";
  const allTerms=document==="promotion"&&(params.period==="all"||params.type==="promotion_all_terms");
  const term=allTerms?(options.terms.at(-1)?.number??1):Math.min(6,Math.max(1,Number(params.period??params.term)||1));
  const basis=params.basis==="provisional"?"provisional":"official";
  const scheduleType:AcademicScheduleType=document==="all_results"?"term_schedule":allTerms?"promotion_all_terms":"promotion_schedule";
  const classNames=(params.classes??"").split(",").map((value)=>value.trim()).filter(Boolean);
  const payload=frozen?.payload ?? await getAcademicSchedulePayload({academicYear:year,termNumber:term,basis,scheduleType,grade:params.grade||undefined,classNames});
  if(!payload)redirect("/");
  const context=await import("@/lib/auth/get-user-context").then((m)=>m.getUserContext());
  if(!context.currentSchoolMembership)redirect("/");
  if(frozen && !frozen.header) notFound();
  const header=frozen?.header?await resolveFrozenOfficialDocumentHeaderAssets(frozen.header):await getLiveSchoolDocumentHeader(context.currentSchoolMembership.schoolId,"internal_school");
  const promotion=payload.scheduleType!=="term_schedule";
  return <main className="schedule-sheet bg-white p-4 text-black">
    <style>{`@page{size:A4 landscape;margin:7mm 7mm 12mm}.schedule-sheet{font-family:Arial,sans-serif}.schedule-table{table-layout:auto;border-collapse:collapse;width:100%;font-size:7px}.schedule-table thead{display:table-header-group}.schedule-table tfoot{display:table-footer-group}.schedule-table tr{break-inside:avoid}.schedule-table th,.schedule-table td{border:1px solid #111;padding:2px;line-height:1.15;vertical-align:middle}.schedule-table th{font-weight:700}.subject-heading{max-width:38px;writing-mode:vertical-rl;transform:rotate(180deg);height:74px;white-space:normal}.document-block{break-inside:avoid}.schedule-footer{position:fixed;bottom:-8mm;left:0;right:0;font-size:7px}.page-number:after{content:counter(page)}@media screen{.schedule-sheet{max-width:1500px;margin:auto}.schedule-table{min-width:1100px}.table-scroll{overflow-x:auto}.schedule-footer{position:static;margin-top:12px}.print-hide{display:flex}}@media print{.print-hide{display:none!important}.table-scroll{overflow:visible}}`}</style>
    <div className="print-hide mb-3 justify-between text-sm"><Link href="/reports/academic-schedules" className="underline">Back to schedules</Link><span>Landscape A4 · print at 100% scale</span></div>
    <header className="grid grid-cols-[70px_1fr_220px] items-center gap-3 border-b-2 border-black pb-2">
      <div>{header.logoUrl?<img src={header.logoUrl} alt="" className="max-h-16 max-w-16 object-contain"/>:null}</div>
      <div className="text-center"><p className="text-[9px] font-bold uppercase">Republic of Namibia · Official school academic record</p><h1 className="text-lg font-bold uppercase">{header.schoolName}</h1><p className="text-[8px]">EMIS {header.schoolEmisNumber||"—"} · {header.contactLines.map((line)=>line.text).join(" · ")}</p><h2 className="mt-1 text-sm font-bold uppercase">{payload.title}</h2></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-[8px]"><dt>Year</dt><dd>{payload.academicYear}</dd><dt>Period</dt><dd>{payload.periodLabel}</dd><dt>Grade</dt><dd>{payload.grade||"All grades"}</dd><dt>Class</dt><dd>{payload.classNames.join(", ")||"All classes"}</dd><dt>Report date</dt><dd>{new Date(payload.generatedAt).toLocaleDateString("en-NA")}</dd>{frozen?<><dt>Issued</dt><dd>Issued version v{frozen.version} · {frozen.status}</dd></>:null}</dl>
    </header>
    {payload.basis==="provisional"?<p className="my-2 border border-black p-1 text-[8px] font-bold">PROVISIONAL — not finalized official evidence.</p>:null}
    {frozen?.status==="superseded"?<p className="my-2 border-2 border-black p-1 text-[8px] font-bold">SUPERSEDED — retained historical version; not the current official schedule.</p>:null}
    <div className="table-scroll mt-2"><table className="schedule-table"><thead><tr>{payload.columns.map((column)=><th key={column} className={payload.subjects?.some((subject)=>column===subject.name||column.startsWith(subject.name+" "))?"subject-heading":""}>{column}</th>)}</tr></thead><tbody>{payload.rows.map((row,index)=><tr key={index}>{payload.columns.map((column)=><td key={column}>{row[column]??""}</td>)}</tr>)}{payload.footerRows?.map((row,index)=><tr key={`footer-${index}`} className="font-bold">{payload.columns.map((column)=><td key={column}>{row[column]??""}</td>)}</tr>)}</tbody></table></div>
    {!payload.rows.length?<p className="mt-6 text-center text-sm">No canonical rows available.</p>:null}
    {promotion?<><section className="document-block mt-3 grid grid-cols-3 gap-3 text-[8px]">{["Class Teacher","Principal","Regional Director"].map((role)=><div key={role} className="border border-black p-2"><p className="font-bold">{role}</p><p className="mt-5">Signature: ____________________</p><p className="mt-3">Name: ________________________</p><p className="mt-3">Date: _________________________</p></div>)}</section><section className="document-block mt-3"><h3 className="text-[9px] font-bold">Outcome analysis</h3><table className="schedule-table mt-1 max-w-xl"><thead><tr><th>Outcome</th><th>Female</th><th>Male</th><th>Total</th></tr></thead><tbody>{payload.outcomeAnalysis?.map((row)=><tr key={row.outcome}><td>{row.outcome}</td><td>{row.female}</td><td>{row.male}</td><td>{row.total}</td></tr>)}</tbody></table></section></>:<section className="document-block mt-3 grid grid-cols-[1fr_1fr_1fr_180px] gap-3 text-[8px]"><div>Name: ____________________</div><div>Signature: ____________________</div><div>Date: ____________________</div><div className="h-20 border border-black p-2 text-center">School Stamp</div><p className="col-span-4">* Adjustment &nbsp;&nbsp; _ Mark below governed pass mark</p></section>}
    <footer className="schedule-footer border-t border-black bg-white pt-1"><span>Generated {new Date(payload.generatedAt).toLocaleString("en-NA")} · {payload.sourceDescription}</span><span className="float-right">Page <span className="page-number"/></span></footer>
  </main>;
}
