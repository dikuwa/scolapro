import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { TeachingCoverageWorkspace } from "@/features/teaching/coverage-workspace";
import { getCoverageWorkspace } from "@/features/teaching/server/coverage-queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";

// Teachers and class_teachers can record actuals; leadership roles can view.
const ALLOWED_ROLES = new Set([
  "school_admin",
  "principal",
  "deputy_principal",
  "hod",
  "teacher",
  "class_teacher",
]);

// Only allocated teachers write actuals; leadership roles are read-only here.
const RECORDER_ROLES = new Set(["teacher", "class_teacher"]);

export const dynamic = "force-dynamic";

export default async function TeachingCoveragePage() {
  const context = await getUserContext();

  if (!context.user) redirect("/login?next=/teaching/coverage");

  // Platform roles carry no school-operational authority.
  if (context.platformMemberships.length) redirect("/");

  const membership = context.memberships.find((m) => ALLOWED_ROLES.has(m.roleKey));
  if (!membership) redirect("/teaching");

  const academicYear = await getGovernedAcademicYear(membership.schoolId);

  const workspace = await getCoverageWorkspace({
    schoolId: membership.schoolId,
    academicYear,
  });

  const canRecord = RECORDER_ROLES.has(membership.roleKey);

  return (
    <AppShell>
      <section className="scolapro-content-width pb-10">
        <Link
          href="/teaching"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Teaching
        </Link>

        <div className="mb-6">
          <h1 className="scolapro-page-title">Coverage &amp; reflection</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Record actual teaching against your scheduled plan items for {academicYear}.
            Planned schedule items are never rewritten; each actual is a separate historical record
            showing what was taught, when, how many periods were used and any reflection or compensatory action.
          </p>
        </div>

        <TeachingCoverageWorkspace {...workspace} canRecord={canRecord} offlineScope={{ userId: context.user.id, tenantId: membership.tenantId, schoolId: membership.schoolId }} />
      </section>
    </AppShell>
  );
}
