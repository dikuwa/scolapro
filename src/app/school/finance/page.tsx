import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { FinanceWorkspace } from "@/features/finance/finance-workspace";
import { getFinanceWorkspace } from "@/features/finance/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

const financeRoles = new Set(["school_admin","principal","finance_officer","bursar"]);
export const dynamic = "force-dynamic";
export default async function FinancePage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/finance");
  const membership = context.memberships.find((item) => financeRoles.has(item.roleKey));
  if (!membership) redirect("/");
  const workspace = await getFinanceWorkspace(membership.schoolId);
  return <AppShell><div className="space-y-5"><div><h1 className="scolapro-page-title">Finance / Payments</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">School banking instructions and governed recording of offline payments. Voluntary fundraising remains under Contributions.</p></div><FinanceWorkspace schoolId={membership.schoolId} today={getNamibiaDateKey()} {...workspace}/></div></AppShell>;
}
