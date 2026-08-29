import { HeartHandshake } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ParentPortal } from "@/features/parents/parent-portal";
import { getParentPortalData } from "@/features/parents/server/portal";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function ParentPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/parent");

  const data = await getParentPortalData();

  return <AppShell>
    <section>
      <div className="mb-6 flex items-start gap-3">
        <span className="scolapro-tone-brand grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)]"><HeartHandshake className="size-4" /></span>
        <div><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">My children</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">See the school-published information connected to your verified guardian relationships. ScolaPro does not expose school-wide learner records to parent accounts.</p></div>
      </div>
      <ParentPortal familyChildren={data.children} reports={data.reports} documents={data.documents} invoices={data.invoices} payments={data.payments} messages={data.messages} claimable={data.claimable} />
    </section>
  </AppShell>;
}
