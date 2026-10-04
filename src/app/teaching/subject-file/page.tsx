import { redirect } from "next/navigation";
import { AppBackLink } from "@/components/navigation/app-back-link";
import { AppShell } from "@/components/shell/app-shell";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { SubjectFileWorkspaceView } from "@/features/teaching/subject-file-workspace";
import { getSubjectFileWorkspace } from "@/features/teaching/server/subject-file";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function SubjectFilePage() {
  const context=await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/subject-file");
  const membership=context.currentSchoolMembership;
  if (!membership) redirect("/");
  const academicYear=await getGovernedAcademicYear(membership.schoolId);
  const data=await getSubjectFileWorkspace(academicYear);
  if (!data) redirect("/teaching");

  return <AppShell><div className="space-y-5">
    <AppBackLink href="/teaching" label="Teaching" />
    <div><h1 className="scolapro-page-title">Subject File</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">A dynamic subject dossier assembled from existing ScolaPro records for {academicYear}. HODs see their effective subject portfolio; teachers see subjects they currently teach.</p></div>
    <SubjectFileWorkspaceView data={data}/>
  </div></AppShell>;
}
