import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ContributionSetup } from "@/features/contributions/contribution-setup";
import { ContributionWorkspace } from "@/features/contributions/contribution-workspace";
import { getContributionWorkspace } from "@/features/contributions/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher"]);
const setupRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function ContributionsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership || !allowedRoles.has(membership.roleKey)) redirect("/");

  const academicYear = new Date().getFullYear();
  const workspace = await getContributionWorkspace(membership.schoolId, academicYear);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <AppShell>
      <div className="space-y-5">
        <div><h1 className="scolapro-page-title text-xl">Voluntary contributions</h1><p className="mt-1 text-sm text-muted-foreground">Configure voluntary campaigns and record parent/learner contributions such as fundraising, goods and raffle participation.</p></div>
        {setupRoles.has(membership.roleKey) ? <ContributionSetup schoolId={membership.schoolId} academicYear={academicYear} today={today} campaigns={workspace.campaigns} /> : null}
        <ContributionWorkspace campaigns={workspace.campaigns} items={workspace.items} contributions={workspace.contributions} academicYear={academicYear} today={today} operationId={randomUUID()} />
      </div>
    </AppShell>
  );
}