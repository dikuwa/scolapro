import { HandCoins } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ContributionWorkspace } from "@/features/contributions/contribution-workspace";
import { getContributionWorkspace } from "@/features/contributions/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher"]);
const configureRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function ContributionsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/contributions");
  const membership = context.memberships[0];
  if (!membership || !allowedRoles.has(membership.roleKey)) redirect("/");
  const data = await getContributionWorkspace(membership.schoolId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return <AppShell><section>
    <div className="mb-5 flex items-start gap-3"><span className="scolapro-tone-mint grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)]"><HandCoins aria-hidden="true" className="size-4" /></span><div><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Voluntary contributions</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Record goods, fundraising and voluntary money without treating them as learner fees or debt.</p></div></div>
    <ContributionWorkspace schoolId={membership.schoolId} canConfigure={configureRoles.has(membership.roleKey)} today={today} academicYear={new Date().getFullYear()} {...data} />
  </section></AppShell>;
}
