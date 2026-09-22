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
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title">Teaching</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Year planner, scheme of work, lesson preparation and coverage from your governed teaching allocation.
          </p>
        </div>
        <Suspense fallback={<TeachingLoading />}>
          <TeachingWorkspaceData
            schoolId={membership.schoolId}
            roleKey={membership.roleKey}
            staffMemberId={membership.staffMemberId}
          />
        </Suspense>
      </div>
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
  // The academic year is governed operational state, not the wall clock. This
  // data can stream after the authenticated shell instead of blocking it.
  const academicYear = await getGovernedAcademicYear(schoolId);
  const workspace = await getTeachingWorkspace({ schoolId, academicYear, roleKey });

  return (
    <>
      <p className="-mt-3 text-xs text-muted-foreground">Academic year {academicYear}</p>
      <TeachingWorkspace
        {...workspace}
        planningHref={reviewRoles.has(roleKey) ? "/teaching/planning" : null}
        curriculumHref={staffMemberId ? "/teaching/curriculum" : null}
        preparationHref={preparationRoles.has(roleKey) ? "/teaching/preparation" : null}
        coverageHref="/teaching/coverage"
        filesHref={staffMemberId ? "/teaching/files" : null}
        reviewHref={reviewRoles.has(roleKey) ? "/teaching/reviews" : null}
      />
    </>
  );
}

function TeachingLoading() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-surface-muted" />
      <div className="h-64 animate-pulse rounded-[var(--radius-md)] border border-border-subtle bg-surface" />
    </div>
  );
}
