import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DetentionHistoryView } from "@/features/late-arrivals/detention-history-view";
import { getDetentionHistory } from "@/features/late-arrivals/server/detention-history-queries";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function DetentionHistoryPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const history = await getDetentionHistory(membership.schoolId);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Detention history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historical detention obligations grouped by learner, including original due dates, carry-forwards, assigned supervision and completion outcomes.
          </p>
        </div>
        <DetentionHistoryView items={history} />
      </div>
    </AppShell>
  );
}
