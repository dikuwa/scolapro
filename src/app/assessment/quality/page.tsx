import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AssessmentQualityWorkspaceView } from "@/features/assessment/assessment-quality-workspace";
import { getAssessmentQualityWorkspace } from "@/features/assessment/server/quality-readiness";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

export default async function AssessmentQualityPage({ searchParams }: { searchParams: Promise<{ year?:string;term?:string;subject?:string;class?:string;teacher?:string;readiness?:string }> }) {
  const params=await searchParams;
  const academicYear=Number(params.year) || getNamibiaCalendarYear();
  const termNumber=params.term ? Number(params.term) : null;
  const workspace=await getAssessmentQualityWorkspace({
    academicYear,
    termNumber:Number.isInteger(termNumber) && termNumber!>=1 && termNumber!<=3 ? termNumber : null,
    subjectOfferingId:params.subject || undefined,
    registerClassId:params.class || undefined,
    teacherStaffMemberId:params.teacher || undefined,
    readiness:params.readiness || undefined,
  });
  if (!workspace) redirect("/assessment");

  return <AppShell><section className="space-y-5">
    <Link href="/assessment" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Assessment</Link>
    <header><h1 className="scolapro-page-title">Assessment quality & readiness</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Completion, component statistics, CA–exam comparison and moderation readiness from the existing assessment lifecycle.</p></header>
    <AssessmentQualityWorkspaceView workspace={workspace}/>
  </section></AppShell>;
}
