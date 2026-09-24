import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LearnerSubjectWorkspace } from "@/features/learners/learner-subject-workspace";
import { canManageLearnerSubjects, getLearnerSubjectWorkspace } from "@/features/learners/server/subject-assignments";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function LearnerSubjectsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.currentSchoolMembership;
  if (!membership || !canManageLearnerSubjects(membership)) redirect(`/learners/${id}`);
  const data = await getLearnerSubjectWorkspace(membership, id);
  if (!data) notFound();
  return (
    <AppShell>
      <section>
        <Link href={`/learners/${id}`} className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] py-1 text-xs font-medium text-muted-foreground transition duration-[var(--motion-fast)] hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{data.learnerName}</Link>
        <div className="mb-5"><h1 className="scolapro-page-title">Academic · Subjects</h1><p className="mt-1 text-sm text-muted-foreground">{data.learnerName} · Manage current subject choices without deleting registration history.</p></div>
        <LearnerSubjectWorkspace data={data} />
      </section>
    </AppShell>
  );
}
