import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { TeachingWorkspace } from "@/features/teaching/teaching-workspace";
import { getTeachingWorkspace } from "@/features/teaching/server/queries";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
const reviewRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);

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
        <div>
          <h1 className="scolapro-page-title">Teaching</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Year planner, scheme of work, lesson preparation and coverage are views of one connected teaching plan built on your governed allocations for {academicYear}.
          </p>
        </div>
        <TeachingWorkspace
          {...workspace}
          reviewHref={reviewRoles.has(membership.roleKey) ? "/teaching/reviews" : null}
        />
      </div>
    </AppShell>
  );
}
