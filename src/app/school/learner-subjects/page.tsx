import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SubjectAssignmentWorkspace } from "@/features/learners/subject-assignment-workspace";
import { canManageLearnerSubjects, getSubjectAssignmentWorkspace } from "@/features/learners/server/subject-assignments";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

export default async function LearnerSubjectsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.currentSchoolMembership;
  if (!membership || !canManageLearnerSubjects(membership)) redirect("/learners");
  const academicYear = getNamibiaCalendarYear();
  const data = await getSubjectAssignmentWorkspace(membership, academicYear);
  return (
    <AppShell>
      <section>
        <Link href="/learners" className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] py-1 text-xs font-medium text-muted-foreground transition duration-[var(--motion-fast)] hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Learners</Link>
        <div className="mb-5"><h1 className="scolapro-page-title">Learner subject assignments</h1><p className="mt-1 text-sm text-muted-foreground">{data.schoolName} · Preview and apply governed {academicYear} subject sets by grade, register class, or existing field / academic group.</p></div>
        <SubjectAssignmentWorkspace data={data} />
      </section>
    </AppShell>
  );
}
