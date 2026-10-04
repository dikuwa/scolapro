import { redirect } from "next/navigation";
import { AppBackLink } from "@/components/navigation/app-back-link";
import { AppShell } from "@/components/shell/app-shell";
import { AssessmentQualityWorkspaceView } from "@/features/assessment/assessment-quality-workspace";
import { getAssessmentQualityWorkspace } from "@/features/assessment/server/quality-readiness";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

export default async function AssessmentQualityPage({ searchParams }: { searchParams: Promise<{ year?:string;term?:string;subject?:string;class?:string;teacher?:string;readiness?:string }> }) {
  const params=await searchParams;
  const academicYear=Number(params.year) || getNamibiaCalendarYear();
  const parsedTerm=params.term ? Number(params.term) : null;
  const termNumber=parsedTerm !== null && Number.isInteger(parsedTerm) && parsedTerm>=1 && parsedTerm<=3 ? parsedTerm : null;
  const workspace=await getAssessmentQualityWorkspace({
    academicYear,
    termNumber,
    subjectOfferingId:params.subject || undefined,
    registerClassId:params.class || undefined,
    teacherStaffMemberId:params.teacher || undefined,
    readiness:params.readiness || undefined,
  });
  if (!workspace) redirect("/assessment");

  return <AppShell><section className="space-y-5">
    <AppBackLink href="/assessment" label="Assessment" />
    <header><h1 className="scolapro-page-title">Assessment quality & readiness</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Completion, component statistics, CA–exam comparison and moderation readiness from the existing assessment lifecycle.</p></header>
    <AssessmentQualityWorkspaceView workspace={workspace}/>
  </section></AppShell>;
}
