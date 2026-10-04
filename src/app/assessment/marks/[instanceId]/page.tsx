import { notFound } from "next/navigation";
import { AppBackLink } from "@/components/navigation/app-back-link";
import { AppShell } from "@/components/shell/app-shell";
import { MarkGridWorkspace } from "@/features/assessment/mark-grid-workspace";
import { getMarkGridData } from "@/features/assessment/server/mark-grid";

export default async function AssessmentMarkGridPage({params}:{params:Promise<{instanceId:string}>}) {
  const {instanceId}=await params;
  const data=await getMarkGridData(instanceId);
  if (!data) notFound();

  return (
    <AppShell>
      <section>
        <AppBackLink href="/assessment/marks" label="Marks entry" className="mb-4" />
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Mark grid</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Fast draft capture with explicit status handling, optimistic version safety and offline queue support.</p></div>
        <MarkGridWorkspace data={data}/>
      </section>
    </AppShell>
  );
}
