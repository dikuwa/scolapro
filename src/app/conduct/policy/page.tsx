import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getUserContext } from "@/lib/auth/get-user-context";
import { ConductPolicySettings } from "@/features/conduct/policy-settings";
import { getConductPolicy } from "@/features/conduct/server/queries";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function ConductPolicyPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/conduct/policy");
  const schoolId = context.currentSchoolMembership?.schoolId;
  if (!schoolId || !context.memberships.some((membership) => membership.schoolId === schoolId && managerRoles.has(membership.roleKey))) redirect("/conduct");

  const policy = await getConductPolicy(schoolId, true);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title">Conduct policy</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Review your school’s Recognition and Violation policy first. Open a group only when you need its items or editing controls.
          </p>
        </div>
        <ConductPolicySettings schoolId={schoolId} groups={policy.groups} categories={policy.categories} />
      </section>
    </AppShell>
  );
}
