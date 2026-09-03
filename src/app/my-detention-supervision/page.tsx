import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { MyDetentionSupervisionWorkspace } from "@/features/late-arrivals/my-detention-supervision-workspace";
import { getMyDetentionSupervision } from "@/features/late-arrivals/server/my-supervision";
import { getUserContext } from "@/lib/auth/get-user-context";

type SearchParams = {
  view?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MyDetentionSupervisionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  if (!context.memberships.length) redirect("/");

  const params = await searchParams;
  const includeResolved = single(params.view) === "history";
  const page = Math.max(Number(single(params.page) ?? "1") || 1, 1);
  const data = await getMyDetentionSupervision({ includeResolved, page, pageSize: 25 });

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">My detention supervision</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Your own assigned detention learners and completion history. This workspace is self-scoped and does not provide access to the school-wide late-arrival management queue.
          </p>
        </div>
        <MyDetentionSupervisionWorkspace data={data} />
      </div>
    </AppShell>
  );
}
