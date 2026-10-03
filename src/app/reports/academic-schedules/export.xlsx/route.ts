import { NextResponse } from "next/server";
import { ACADEMIC_SCHEDULE_TYPES, getAcademicSchedulePayload, getAcademicScheduleSnapshot, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";
import { getLiveSchoolDocumentHeader, resolveFrozenOfficialDocumentHeaderAssets } from "@/features/documents/server/live-school-document-profile";
import { academicScheduleXlsxFilename, renderAcademicScheduleXlsx } from "@/features/reporting/server/render-academic-schedule-xlsx";
import { getUserContext } from "@/lib/auth/get-user-context";

export async function GET(request:Request){
  const url=new URL(request.url);
  const snapshotId=url.searchParams.get("snapshot");
  const frozen=snapshotId ? await getAcademicScheduleSnapshot(snapshotId) : null;
  if(snapshotId && !frozen)return NextResponse.json({error:"Issued schedule snapshot not found."},{status:404});
  const year=Number(url.searchParams.get("year"))||new Date().getFullYear();
  const term=Math.min(6,Math.max(1,Number(url.searchParams.get("term"))||1));
  const basis=url.searchParams.get("basis")==="provisional"?"provisional":"official";
  const requested=url.searchParams.get("type") as AcademicScheduleType|null;
  const scheduleType=requested&&ACADEMIC_SCHEDULE_TYPES.includes(requested)?requested:"term_schedule";
  const payload=frozen?.payload ?? await getAcademicSchedulePayload({academicYear:year,termNumber:term,basis,scheduleType});
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
