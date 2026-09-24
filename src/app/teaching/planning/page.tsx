import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { PlanningWorkspace } from "@/features/teaching/planning-workspace";
import { getTeachingPlanningData } from "@/features/teaching/server/queries";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

const planningRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);

export const dynamic = "force-dynamic";

// Authorization mirrors /teaching exactly, then narrows to the roles that hold
// planning authority. The authoring read itself lives in the shared teaching
// server module so authoring and viewing cannot drift into two query paths.
export default async function TeachingPlanningPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/planning");
  if (context.platformMemberships.length) redirect("/");

  const membership = context.memberships.find((item) => planningRoles.has(item.roleKey));
  if (!membership) redirect("/teaching");

  const academicYear = await getGovernedAcademicYear(membership.schoolId);
  const data = await getTeachingPlanningData({
    schoolId: membership.schoolId,
    academicYear,
    roleKey: membership.roleKey,
    staffMemberId: membership.staffMemberId,
  });

  return (
    <AppShell>
      <section className="pb-10">
        <Link
          href="/teaching"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Teaching
        </Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title">Teaching plan</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Author the one connected teaching plan for {membership.schoolName} in the school&apos;s
            governed academic year ({academicYear}). The year planner and scheme of work on Teaching
            are views of these same plans, and official curriculum units, objectives and
            competencies stay read-only.
          </p>
        </div>
        <PlanningWorkspace data={data} />
      </section>
    </AppShell>
  );
}

export async function generateMetadata() {
  return {
    title: "Teaching plan",
  };
}
