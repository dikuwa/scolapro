import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AbsenceReviewList } from "@/features/parents/absence-review-list";
import { getSchoolAbsenceNotices } from "@/features/parents/server/absence-queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher", "hod"]);

export default async function AbsenceReviewsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership || !allowedRoles.has(membership.roleKey)) redirect("/");

  const notices = await getSchoolAbsenceNotices(membership.schoolId);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Absence reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and action parent-submitted absence documentation. Accepting does not automatically modify the official attendance register.
          </p>
        </div>
        <AbsenceReviewList notices={notices} />
      </div>
    </AppShell>
  );
}
