import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CurriculumAccessWorkspace } from "@/features/teaching/curriculum-access-workspace";
import { getTeacherCurriculumAccess } from "@/features/teaching/server/curriculum-access";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);

export const dynamic = "force-dynamic";

export default async function TeachingCurriculumPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/curriculum");
  if (context.platformMemberships.length) redirect("/");

  const membership = context.memberships.find(
    (item) => allowedRoles.has(item.roleKey) && Boolean(item.staffMemberId),
  );
  if (!membership?.staffMemberId) redirect("/teaching");

  const academicYear = await getGovernedAcademicYear(membership.schoolId);
  const data = await getTeacherCurriculumAccess({
    schoolId: membership.schoolId,
    academicYear,
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
        <CurriculumAccessWorkspace data={data} />
      </section>
    </AppShell>
  );
}
