import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DetentionHistoryView } from "@/features/late-arrivals/detention-history-view";
import { getDetentionHistoryPage } from "@/features/late-arrivals/server/detention-history-queries";
import { getUserContext } from "@/lib/auth/get-user-context";

type DetentionHistorySearchParams = {
  q?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DetentionHistoryPage({ searchParams }: { searchParams: Promise<DetentionHistorySearchParams> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const params = await searchParams;
  const query = single(params.q) ?? "";
  const requestedPage = Math.max(Number(single(params.page) ?? "1") || 1, 1);
  const history = await getDetentionHistoryPage(membership.schoolId, { query, page: requestedPage, pageSize: 25 });

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Detention history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historical detention obligations grouped by learner, including original due dates, carry-forwards, assigned supervision and completion outcomes.
          </p>
        </div>
        <DetentionHistoryView
          items={history.items}
          query={history.query}
          page={history.page}
          pageSize={history.pageSize}
          totalLearners={history.totalLearners}
        />
      </div>
    </AppShell>
  );
}
