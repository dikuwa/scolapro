import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ResponsibilitiesWorkspace } from "@/features/responsibilities/responsibilities-workspace";
import { getSchoolDutyWorkspace } from "@/features/responsibilities/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const leadershipRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function ResponsibilitiesPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/responsibilities");

  const membership = context.memberships.find((candidate) => leadershipRoles.has(candidate.roleKey));
  if (!membership || context.platformMemberships.length > 0) redirect("/");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const workspace = await getSchoolDutyWorkspace(membership.schoolId, today);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">
            Delegated responsibilities
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Give staff a bounded operational responsibility without changing their base ScolaPro role. Delegations remain school-local, effective-dated, auditable, and expire with the staff member&apos;s governed school placement.
          </p>
        </div>
        <ResponsibilitiesWorkspace
          schoolId={membership.schoolId}
          today={today}
          capabilities={workspace.capabilities}
          assignments={workspace.assignments}
          staff={workspace.staff}
        />
      </section>
    </AppShell>
  );
}
