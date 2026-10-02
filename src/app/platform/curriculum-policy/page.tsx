import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CurriculumTimeGovernance } from "@/features/platform/curriculum-time-governance";
import { getCurriculumTimeGovernanceWorkspace } from "@/features/platform/server/curriculum-time-governance";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function PlatformCurriculumPolicyPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/platform/curriculum-policy");
  if (!context.platformMemberships.some((membership) => membership.roleKey === "platform_admin")) redirect("/");

  const workspace = await getCurriculumTimeGovernanceWorkspace();

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Curriculum &amp; policy</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Govern Namibia/NIED curriculum time-allocation evidence, human verification, exact-cycle rules, supersession and source conflicts. Draft extraction remains staged until a Platform Administrator verifies and publishes it.
          </p>
        </div>
        <CurriculumTimeGovernance workspace={workspace} />
      </section>
    </AppShell>
  );
}
