import { Suspense } from "react";
import { redirect } from "next/navigation";
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

  return (
    <AppShell>
      <Suspense fallback={<TeachingLoading />}>
        <TeachingWorkspaceData
          schoolId={membership.schoolId}
          roleKey={membership.roleKey}
          staffMemberId={membership.staffMemberId}
        />
      </Suspense>
    </AppShell>
  );
}

async function TeachingWorkspaceData({
  schoolId,
  roleKey,
  staffMemberId,
}: {
  schoolId: string;
  roleKey: string;
  staffMemberId: string | null;
}) {
  const academicYear = await getGovernedAcademicYear(schoolId);
  const workspace = await getTeachingWorkspace({
    schoolId,
    academicYear,
    roleKey,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="scolapro-page-title">Teaching</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Year planner, scheme of work, lesson preparation and coverage are views of one connected teaching plan built on your governed allocations for {academicYear}.
        </p>
      </div>
      <TeachingWorkspace
        {...workspace}
        planningHref={reviewRoles.has(roleKey) ? "/teaching/planning" : null}
        curriculumHref={staffMemberId ? "/teaching/curriculum" : null}
        preparationHref={preparationRoles.has(roleKey) ? "/teaching/preparation" : null}
        coverageHref="/teaching/coverage"
        filesHref={staffMemberId ? "/teaching/files" : null}
        reviewHref={reviewRoles.has(roleKey) ? "/teaching/reviews" : null}
      />
    </div>
  );
}

function TeachingLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div>
        <div className="h-8 w-40 animate-pulse rounded-[var(--radius-xs)] bg-surface-muted" />
        <div className="mt-2 h-4 w-full max-w-2xl animate-pulse rounded-[var(--radius-xs)] bg-surface-muted" />
      </div>
      <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-xs)]">
        <div className="h-5 w-52 animate-pulse rounded-[var(--radius-xs)] bg-surface-subtle" />
        <div className="mt-4 h-28 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      </div>
    </div>
  );
}
