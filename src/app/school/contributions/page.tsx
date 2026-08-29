import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ContributionWorkspace } from "@/features/contributions/contribution-workspace";
import { listContributionEligibleLearners } from "@/features/contributions/server/eligible-learners";
import { getContributionWorkspace } from "@/features/contributions/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher"]);

export default async function ContributionsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership || !allowedRoles.has(membership.roleKey)) redirect("/");

  const academicYear = new Date().getFullYear();
  const [workspace, learners] = await Promise.all([
    getContributionWorkspace(membership.schoolId, academicYear),
    listContributionEligibleLearners(membership.schoolId, academicYear, membership.roleKey),
  ]);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Voluntary contributions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record and track voluntary parent/learner contributions such as fundraising, goods, and raffle participation.
          </p>
        </div>
        <ContributionWorkspace
          campaigns={workspace.campaigns}
          items={workspace.items}
          contributions={workspace.contributions}
          learners={learners}
          today={today}
        />
      </div>
    </AppShell>
  );
}
