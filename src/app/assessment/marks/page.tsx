import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { MarkGridWorkspace } from "@/features/assessment/mark-grid-workspace";
import { getMarkGridWorkspace } from "@/features/assessment/server/mark-grid";

export default async function AssessmentMarksPage({
  searchParams,
}: {
  searchParams: Promise<{ instance?: string }>;
}) {
  const params=await searchParams;
  const data=await getMarkGridWorkspace(params.instance??null);
  if(!data) redirect("/assessment");
  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Mark entry</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Fast draft capture with explicit statuses, offline-safe autosave and governed submission. Frozen learner identity is used on larger screens; phones use one learner at a time.</p>
        </div>
        <MarkGridWorkspace
          data={data}
          offlineScope={{userId:data.userId,tenantId:data.tenantId,schoolId:data.schoolId}}
        />
      </section>
    </AppShell>
  );
}
