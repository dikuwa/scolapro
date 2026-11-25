import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProgressionWorkspace } from "@/features/progression/progression-workspace";
import { getProgressionWorkspace } from "@/features/progression/server/workspace";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

const progressionRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const approvalRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function ProgressionPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/progression");
  if (context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const role = context.currentSchoolMembership.roleKey;
  if (!progressionRoles.has(role)) redirect("/");

  const schoolId = context.currentSchoolMembership.schoolId;
  const academicYear = await getGovernedAcademicYear(schoolId);
  const workspace = await getProgressionWorkspace(schoolId, academicYear);

  return (
    <AppShell>
      <ProgressionWorkspace workspace={workspace} canApprove={approvalRoles.has(role)} today={getNamibiaDateKey()} />
    </AppShell>
  );
}
