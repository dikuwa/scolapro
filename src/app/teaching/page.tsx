import { redirect } from "next/navigation";
import Link from "next/link";
import { FolderKanban, UsersRound } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { TeachingWorkspace } from "@/features/teaching/teaching-workspace";
import { getTeachingWorkspace } from "@/features/teaching/server/queries";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
const reviewRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);
const planningRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
const staffTeachingRoles = new Set(["hod", "teacher", "class_teacher"]);
const preparationRoles = new Set(["teacher", "class_teacher"]);

export const dynamic = "force-dynamic";

export default async function TeachingPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching");
  if (context.platformMemberships.length) redirect("/");

  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const schoolMemberships = context.memberships.filter((item) => item.schoolId === membership.schoolId);
  const roleKeys = new Set(schoolMemberships.map((item) => item.roleKey));
  const staffTeachingMembership = schoolMemberships.find(
    (item) => Boolean(item.staffMemberId) && staffTeachingRoles.has(item.roleKey),
  );
  const preparationMembership = schoolMemberships.find(
    (item) => Boolean(item.staffMemberId) && preparationRoles.has(item.roleKey),
  );
  const canPlan = schoolMemberships.some((item) => planningRoles.has(item.roleKey));
  const canReview = schoolMemberships.some((item) => reviewRoles.has(item.roleKey));
  const canUseSubjectFile = Boolean(staffTeachingMembership);
  const canUseOversight = roleKeys.has("hod");

  // The academic year is governed operational state, not the wall clock: a school
  // can be running a configured or activated year that differs from the calendar
  // year, and the plan authoring route reads the same resolved year.
  const academicYear = await getGovernedAcademicYear(membership.schoolId);
  const workspace = await getTeachingWorkspace({
    schoolId: membership.schoolId,
    academicYear,
    roleKey: membership.roleKey,
    staffMemberId: membership.staffMemberId,
  });

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="scolapro-page-title">Teaching</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Year planner, scheme of work, lesson preparation and coverage are views of one connected teaching plan built on your governed allocations for {academicYear}.</p>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">{canUseSubjectFile ? <Link href="/teaching/subject-file" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-surface px-4 text-sm font-medium shadow-[var(--shadow-xs)] hover:bg-surface-muted"><FolderKanban className="size-4" aria-hidden="true" />Subject File</Link> : null}<Link href="/class-lists" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-surface px-4 text-sm font-medium shadow-[var(--shadow-xs)] hover:bg-surface-muted"><UsersRound className="size-4" aria-hidden="true" />Class Lists</Link></div>
        </div>
        <TeachingWorkspace
          {...workspace}
          planningHref={canPlan ? "/teaching/planning" : null}
          curriculumHref={staffTeachingMembership ? "/teaching/curriculum" : null}
          preparationHref={preparationMembership ? "/teaching/preparation" : null}
          coverageHref="/teaching/coverage"
          filesHref={staffTeachingMembership ? "/teaching/files" : null}
          reviewHref={canReview ? "/teaching/reviews" : null}
          oversightHref={canUseOversight ? "/teaching/oversight" : null}
        />
      </div>
    </AppShell>
  );
}
