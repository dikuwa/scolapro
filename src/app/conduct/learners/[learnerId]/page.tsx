import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { LearnerConductProfileView } from "@/features/conduct/learner-conduct-profile";
import { getLearnerConductProfile } from "@/features/conduct/server/profile";
import { conductRoles } from "@/features/conduct/types";
import { getLearnerOverview } from "@/features/learners/server/queries";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function LearnerConductProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ learnerId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/conduct/learners");

  const currentSchoolId = context.currentSchoolMembership?.schoolId;
  const membership = currentSchoolId
    ? context.memberships.find((candidate) => candidate.schoolId === currentSchoolId && conductRoles.includes(candidate.roleKey))
    : null;
  if (!membership) redirect("/");

  const { learnerId } = await params;
  const parsedLearner = z.string().uuid().safeParse(learnerId);
  if (!parsedLearner.success) notFound();

  const search = await searchParams;
  const rawPage = Array.isArray(search.page) ? search.page[0] : search.page;
  const page = Math.max(0, Math.min(10000, Math.floor(Number(rawPage) || 0)));
  const academicYear = await getGovernedAcademicYear(membership.schoolId);

  const [learner, profile] = await Promise.all([
    getLearnerOverview(parsedLearner.data, membership.schoolId),
    getLearnerConductProfile(membership.schoolId, parsedLearner.data, academicYear, page),
  ]);
  if (!learner) notFound();

  return (
    <AppShell>
      <section>
        <Link href="/conduct" className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Conduct
        </Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title">{learner.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{learner.grade} · {learner.registerClass} · Conduct profile</p>
        </div>
        <LearnerConductProfileView
          learnerId={learner.id}
          learnerName={learner.name}
          classLabel={learner.registerClass}
          profile={profile}
          page={page}
        />
      </section>
    </AppShell>
  );
}
