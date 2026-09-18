import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DetentionHistoryView } from "@/features/late-arrivals/detention-history-view";
import {
  getDetentionHistoryPage,
  type DetentionLifecycleFilter,
} from "@/features/late-arrivals/server/detention-history-queries";
import { getUserContext } from "@/lib/auth/get-user-context";

type DetentionHistorySearchParams = {
  q?: string | string[];
  page?: string | string[];
  lifecycle?: string | string[];
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function lifecycleFilter(value: string | undefined): DetentionLifecycleFilter {
  return value === "outstanding" ||
    value === "overdue" ||
    value === "partial" ||
    value === "completed"
    ? value
    : "all";
}

export default async function DetentionHistoryPage({ searchParams }: { searchParams: Promise<DetentionHistorySearchParams> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");

  const membership = context.currentSchoolMembership;
  if (!membership) redirect("/");

  const params = await searchParams;
  const query = single(params.q) ?? "";
  const lifecycle = lifecycleFilter(single(params.lifecycle));
  const requestedPage = Math.max(Number(single(params.page) ?? "1") || 1, 1);
  const history = await getDetentionHistoryPage(membership.schoolId, {
    query,
    lifecycle,
    page: requestedPage,
    pageSize: 25,
  });

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Detention obligations</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Track outstanding, missed and fulfilled detention obligations without changing official attendance. Filters select learners while each expanded record retains its full detention history.
          </p>
        </div>
        <DetentionHistoryView
          items={history.items}
          summary={history.summary}
          query={history.query}
          lifecycle={history.lifecycle}
          page={history.page}
          pageSize={history.pageSize}
          totalLearners={history.totalLearners}
        />
      </div>
    </AppShell>
  );
}
