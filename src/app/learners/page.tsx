import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LearnerDirectory } from "@/features/learners/learner-directory";
import { listLearnersForSchool, type LearnerListItem } from "@/features/learners/server/queries";
import { getRegistrationOptions, type GradeOption } from "@/features/learners/server/registration-options";
import { getUserContext } from "@/lib/auth/get-user-context";
import { isSupabaseConfigured } from "@/lib/config/runtime";

const demoLearners: LearnerListItem[] = [
  { id: "demo-001", name: "Amara Demo", preferredName: "Amara", admissionNumber: "DEMO-001", grade: "Grade 10", registerClass: "Grade 10/A", status: "current" },
  { id: "demo-002", name: "Tomas Sample", preferredName: "Tomas", admissionNumber: "DEMO-002", grade: "Grade 10", registerClass: "Grade 10/B", status: "current" },
];

export default async function LearnersPage() {
  let learners = demoLearners;
  let academicOptions: GradeOption[] = [];
  let schoolName = "ScolaPro Demonstration School";
  const academicYear = new Date().getFullYear();

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (!context.user) redirect("/login");
    const membership = context.memberships[0];
    if (membership) {
      schoolName = membership.schoolName;
      [learners, academicOptions] = await Promise.all([
        listLearnersForSchool(membership.schoolId, academicYear),
        getRegistrationOptions(membership.schoolId, academicYear),
      ]);
    } else learners = [];
  }

  return (
    <AppShell>
      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Learners</h1>
            <p className="mt-1 text-sm text-muted-foreground">{schoolName} · Current learner identities and enrolments.</p>
          </div>
          <Link href="/learners/register" className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 self-start bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong sm:self-auto">
            <Plus aria-hidden="true" className="size-4" /> Register learner
          </Link>
        </div>

        <LearnerDirectory learners={learners} academicOptions={academicOptions} />
      </section>
    </AppShell>
  );
}
