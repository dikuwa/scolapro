import { NextResponse } from "next/server";
import { getAcademicScheduleFilterOptions, getAcademicSchedulePayload, getAcademicScheduleSnapshot, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";
import { getLiveSchoolDocumentHeader, resolveFrozenOfficialDocumentHeaderAssets } from "@/features/documents/server/live-school-document-profile";
import { academicScheduleXlsxFilename, renderAcademicScheduleXlsx } from "@/features/reporting/server/render-academic-schedule-xlsx";
import { getUserContext } from "@/lib/auth/get-user-context";

export async function GET(request:Request){
  const url=new URL(request.url);
  const legacyType=url.searchParams.get("type")??"";
  const analysisCompat:Record<string,string>={retention_at_risk:"learners",incomplete_results:"results",subject_failure:"results",top_achievers:"overview",class_grade_summary:"grades",promotion_exceptions:"promotion_exceptions"};
  if(analysisCompat[legacyType]){
    const target=new URL("/academics/analysis/export.xlsx",url);
    for(const key of ["year","term","basis","grade","class"])if(url.searchParams.get(key))target.searchParams.set(key,url.searchParams.get(key)!);
    target.searchParams.set("view",analysisCompat[legacyType]);
    return NextResponse.redirect(target);
  }
  const snapshotId=url.searchParams.get("snapshot");
  const frozen=snapshotId ? await getAcademicScheduleSnapshot(snapshotId) : null;
  if(snapshotId && !frozen)return NextResponse.json({error:"Issued schedule snapshot not found."},{status:404});
  const year=Number(url.searchParams.get("year"))||new Date().getFullYear();
  const document=url.searchParams.get("document")==="all_results"||url.searchParams.get("type")==="term_schedule"?"all_results":"promotion";
  const allTerms=document==="promotion"&&(url.searchParams.get("period")==="all"||url.searchParams.get("type")==="promotion_all_terms");
  const options=await getAcademicScheduleFilterOptions(year);
  const term=allTerms?(options.terms.at(-1)?.number??1):Math.min(6,Math.max(1,Number(url.searchParams.get("period")??url.searchParams.get("term"))||1));
  const basis=url.searchParams.get("basis")==="provisional"?"provisional":"official";
  const scheduleType:AcademicScheduleType=document==="all_results"?"term_schedule":allTerms?"promotion_all_terms":"promotion_schedule";
  const gradeId=url.searchParams.get("grade")||undefined;
  const classIds=(url.searchParams.get("classes")??"").split(",").map((value)=>value.trim()).filter(Boolean);
  const payload=frozen?.payload ?? await getAcademicSchedulePayload({academicYear:year,termNumber:term,basis,scheduleType,gradeId,classIds});
  if(!payload)return NextResponse.json({error:"Not authorized."},{status:403});
  const context=await getUserContext();
  if(!context.currentSchoolMembership)return NextResponse.json({error:"Not authorized."},{status:403});
  if(frozen && !frozen.header)return NextResponse.json({error:"Issued schedule header is unavailable."},{status:409});
  const header=frozen?.header
    ? await resolveFrozenOfficialDocumentHeaderAssets(frozen.header)
    : await getLiveSchoolDocumentHeader(context.currentSchoolMembership.schoolId,"internal_school");
  const lifecycle=frozen?{version:frozen.version,status:frozen.status,finalizedAt:frozen.finalizedAt,supersessionReason:frozen.supersessionReason}:undefined;
  const body=renderAcademicScheduleXlsx(payload,header,lifecycle);
  return new NextResponse(new Uint8Array(body),{headers:{
    "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition":'attachment; filename="'+academicScheduleXlsxFilename(payload,lifecycle)+'"',
    "Cache-Control":"private, no-store",
  }});
}
