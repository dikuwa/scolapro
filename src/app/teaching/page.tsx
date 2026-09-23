import { redirect } from "next/navigation";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { TeachingWorkspace } from "@/features/teaching/teaching-workspace";
import { getTeachingWorkspace } from "@/features/teaching/server/queries";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
const reviewRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);
const preparationRoles = new Set(["teacher", "class_teacher"]);

export const dynamic = "force-dynamic";

export default async function TeachingPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching");
  if (context.platformMemberships.length) redirect("/");

  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  // The academic year is governed operational state, not the wall clock: a school
  // can be running a configured or activated year that differs from the calendar
  // year, and the plan authoring route reads the same resolved year.
  const academicYear = await getGovernedAcademicYear(membership.schoolId);
  const workspace = await getTeachingWorkspace({
    schoolId: membership.schoolId,
    academicYear,
    roleKey: membership.roleKey,
  });

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="scolapro-page-title">Teaching</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Year planner, scheme of work, lesson preparation and coverage are views of one connected teaching plan built on your governed allocations for {academicYear}.</p>
          </div>
          <Link href="/class-lists" className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-[var(--radius-sm)] bg-surface px-4 text-sm font-medium shadow-[var(--shadow-xs)] hover:bg-surface-muted sm:self-auto"><UsersRound className="size-4" aria-hidden="true" />Class Lists</Link>
        </div>
        <TeachingWorkspace
          {...workspace}
          planningHref={reviewRoles.has(membership.roleKey) ? "/teaching/planning" : null}
          curriculumHref={membership.staffMemberId ? "/teaching/curriculum" : null}
          preparationHref={preparationRoles.has(membership.roleKey) ? "/teaching/preparation" : null}
          coverageHref="/teaching/coverage"
          filesHref={membership.staffMemberId ? "/teaching/files" : null}
          reviewHref={reviewRoles.has(membership.roleKey) ? "/teaching/reviews" : null}
        />
      </div>
    </AppShell>
  );
}
