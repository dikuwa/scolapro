import { notFound, redirect } from "next/navigation";
import { DocumentBackLink } from "@/components/documents/document-back-link";
import { OFFICIAL_DOCUMENT_HTML_HEADER_RULE, OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE } from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import { officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentHeader, resolveFrozenOfficialDocumentHeaderAssets } from "@/features/documents/server/live-school-document-profile";
import { academicScheduleCellAlignment, academicScheduleColumnKind, academicScheduleColumnLabel, academicScheduleColumnWidth, academicScheduleHeadingOrientation } from "@/features/reporting/academic-schedule-column-layout";
import { getAcademicScheduleFilterOptions, getAcademicSchedulePayload, getAcademicScheduleSnapshot, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";

export default async function AcademicSchedulePrintPage({searchParams}:{searchParams:Promise<{year?:string;term?:string;period?:string;basis?:string;type?:string;document?:string;grade?:string;class?:string;classes?:string;snapshot?:string}>}){
  const params=await searchParams;
  const analysisCompat:Record<string,string>={retention_at_risk:"learners",incomplete_results:"results",subject_failure:"results",top_achievers:"overview",class_grade_summary:"grades",promotion_exceptions:"promotion_exceptions"};
  if(params.type&&analysisCompat[params.type]){
    const bridge=new URLSearchParams({basis:params.basis??"official",view:analysisCompat[params.type]});
    if(params.year) bridge.set("year",params.year);
    if(params.term) bridge.set("term",params.term);
    if(params.grade) bridge.set("grade",params.grade);
    if(params.class) bridge.set("class",params.class);
    redirect("/academics/analysis/print?"+bridge.toString());
  }
  const frozen=params.snapshot ? await getAcademicScheduleSnapshot(params.snapshot) : null;
  if(params.snapshot && !frozen) notFound();
  const year=Number(params.year)||new Date().getFullYear();
  const options=await getAcademicScheduleFilterOptions(year);
  const document=params.document==="all_results"||params.type==="term_schedule"?"all_results":"promotion";
  const allTerms=document==="promotion"&&(params.period==="all"||params.type==="promotion_all_terms");
  const term=allTerms?(options.terms.at(-1)?.number??1):Math.min(6,Math.max(1,Number(params.period??params.term)||1));
  const basis=params.basis==="provisional"?"provisional":"official";
  const scheduleType:AcademicScheduleType=document==="all_results"?"term_schedule":allTerms?"promotion_all_terms":"promotion_schedule";
  const gradeOption=options.grades.find((row)=>row.value===params.grade||row.label===params.grade||row.code===params.grade);
  if(!frozen&&params.grade&&!gradeOption) notFound();
  const gradeId=gradeOption?.value??options.grades[0]?.value;
  const classOptions=gradeId?(options.classesByGrade[gradeId]??[]):[];
  const rawClassScope=(params.classes??params.class??"").split(",").map((value)=>value.trim()).filter(Boolean);
  const classIds=[...new Set(rawClassScope.map((value)=>classOptions.find((row)=>row.value===value||row.label===value||row.code===value)?.value).filter((value):value is string=>Boolean(value)))].sort();
  if(!frozen&&rawClassScope.length&&classIds.length!==new Set(rawClassScope).size) notFound();
  const payload=frozen?.payload ?? await getAcademicSchedulePayload({academicYear:year,termNumber:term,basis,scheduleType,gradeId,classIds});
  if(!payload)redirect("/");
  const context=await import("@/lib/auth/get-user-context").then((m)=>m.getUserContext());
  if(!context.currentSchoolMembership)redirect("/");
  if(frozen && !frozen.header) notFound();
  const header=frozen?.header?await resolveFrozenOfficialDocumentHeaderAssets(frozen.header):await getLiveSchoolDocumentHeader(context.currentSchoolMembership.schoolId,officialDocumentHeaderModeForType("academic_schedule"));
  const promotion=payload.scheduleType!=="term_schedule";
  const subjectNames=(payload.subjects??[]).map((subject)=>subject.name);
  const columnLayout=payload.columns.map((column)=>({
    column,
    kind:academicScheduleColumnKind(column,subjectNames),
    width:academicScheduleColumnWidth(column,subjectNames),
    orientation:academicScheduleHeadingOrientation(column,subjectNames),
    alignment:academicScheduleCellAlignment(column,subjectNames),
  }));
  return <main className="schedule-sheet report bg-white p-4 text-black">
    <style>{`@page{size:A4 landscape;margin:7mm 7mm 12mm}:root{--line:#4a4a4a}${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}${OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE}.schedule-sheet{font-family:Arial,sans-serif;border:0}.schedule-table{table-layout:fixed;border-collapse:collapse;width:100%;font-size:7px}.schedule-table thead{display:table-header-group}.schedule-table tfoot{display:table-footer-group}.schedule-table tr{break-inside:avoid}.schedule-table th,.schedule-table td{border:1px solid #111;padding:2px;line-height:1.15;vertical-align:middle}.schedule-table th{font-weight:700;vertical-align:middle}.metric-heading,.subject-heading{position:relative;height:64px;padding:0!important;white-space:nowrap;text-align:center;vertical-align:middle}.metric-heading .heading-label,.subject-heading .heading-label{position:absolute;left:50%;top:50%;writing-mode:vertical-rl;transform:translate(-50%,-50%) rotate(180deg);transform-origin:center;white-space:nowrap}.metric-heading{font-weight:700}.subject-heading{font-weight:400}.identity-heading{white-space:normal;vertical-align:middle}.center-heading{text-align:center}.center-cell{text-align:center}.document-block{break-inside:avoid}.schedule-context{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:12px;align-items:start;padding:7px 2px 6px}.schedule-footer{position:fixed;bottom:-8mm;left:0;right:0;font-size:7px}.page-number:after{content:counter(page)}@media screen{.schedule-table{width:100%}.table-scroll{overflow:visible}.schedule-footer{position:static;margin-top:12px}.scolapro-screen-only{display:flex}}@media print{.scolapro-screen-only{display:none!important}.table-scroll{overflow:visible}}`}</style>
    <div className="scolapro-screen-only mb-3 justify-between text-sm"><DocumentBackLink href="/reports/academic-schedules" label="Back to schedules" /><span>Landscape A4 · print at 100% scale</span></div>
    <div dangerouslySetInnerHTML={{__html:renderOfficialDocumentHtmlHeader(header)}} />
    <section className="schedule-context">
      <div>
        <p className="text-[8px] font-bold uppercase">Official school academic record</p>
        <h1 className="mt-0.5 text-sm font-bold uppercase">{payload.title} — {(payload.classNames??[]).join(", ")||"All classes"}</h1>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-[8px]"><dt>Grade/Class</dt><dd className="font-bold">{payload.grade||"Not recorded"} · {(payload.classNames??[]).join(", ")||"All classes"}</dd><dt>Term</dt><dd>{payload.periodLabel}</dd><dt>Year</dt><dd>{payload.academicYear}</dd><dt>Basis</dt><dd>{payload.basis.toUpperCase()}</dd><dt>Generated</dt><dd>{new Date(payload.generatedAt).toLocaleDateString("en-NA")}</dd>{frozen?<><dt>Issued</dt><dd>Issued version v{frozen.version} · {frozen.status}</dd></>:null}</dl>
    </section>
    {payload.basis==="provisional"?<p className="my-2 border border-black p-1 text-[8px] font-bold">PROVISIONAL — not finalized official evidence.</p>:null}
    {frozen?.status==="superseded"?<p className="my-2 border-2 border-black p-1 text-[8px] font-bold">SUPERSEDED — retained historical version; not the current official schedule.</p>:null}
    <div className="table-scroll mt-2"><table className="schedule-table"><colgroup>{columnLayout.map(({column,width})=><col key={column} style={{width:`${width}ch`}} />)}</colgroup><thead><tr>{columnLayout.map(({column,kind,orientation,alignment})=><th key={column} className={(orientation==="vertical"?(kind==="subject"?"subject-heading":"metric-heading"):"identity-heading")+(alignment==="center"?" center-heading":"")}><span className="heading-label">{academicScheduleColumnLabel(column)}</span></th>)}</tr></thead><tbody>{payload.rows.map((row,index)=><tr key={index}>{payload.columns.map((column)=><td key={column} className={academicScheduleCellAlignment(column,subjectNames)==="center"?"center-cell":undefined}>{row[column]??""}</td>)}</tr>)}{payload.footerRows?.map((row,index)=><tr key={`footer-${index}`} className="font-bold">{payload.columns.map((column)=><td key={column} className={academicScheduleCellAlignment(column,subjectNames)==="center"?"center-cell":undefined}>{row[column]??""}</td>)}</tr>)}</tbody></table></div>
    {!payload.rows.length?<p className="mt-6 text-center text-sm">No canonical rows available.</p>:null}
    {promotion?<><p className="document-block mt-2 text-[8px]">* Does not conform to the governed promotion/pass requirement for that subject.</p><section className="document-block mt-3 grid grid-cols-3 gap-3 text-[8px]">{["Class Teacher","Principal","Regional Director"].map((role)=><div key={role} className="border border-black p-2"><p className="font-bold">{role}</p><p className="mt-5">Signature: ____________________</p><p className="mt-3">Name: ________________________</p><p className="mt-3">Date: _________________________</p></div>)}</section><section className="document-block mt-3"><h3 className="text-[9px] font-bold">Outcome analysis</h3><table className="schedule-table mt-1 max-w-xl"><thead><tr><th>Outcome</th><th>Female</th><th>Male</th><th>Total</th></tr></thead><tbody>{payload.outcomeAnalysis?.map((row)=><tr key={row.outcome}><td>{row.outcome}</td><td>{row.female}</td><td>{row.male}</td><td>{row.total}</td></tr>)}</tbody></table></section></>:<section className="document-block mt-3 grid grid-cols-[1fr_1fr_1fr_180px] gap-3 text-[8px]"><div>Name: ____________________</div><div>Signature: ____________________</div><div>Date: ____________________</div><div className="h-20 border border-black p-2 text-center">School Stamp</div><p className="col-span-4">* Adjustment &nbsp;&nbsp; _ Mark below governed pass mark</p></section>}
    <footer className="schedule-footer border-t border-black bg-white pt-1"><span>Generated {new Date(payload.generatedAt).toLocaleString("en-NA")} · {payload.sourceDescription}</span><span className="float-right">Page <span className="page-number"/></span></footer>
  </main>;
}
