import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
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
        <Link href="/assessment/marks" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong"><ArrowLeft className="size-4"/>Marks entry</Link>
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Mark grid</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Fast draft capture with explicit status handling, optimistic version safety and offline queue support.</p></div>
        <MarkGridWorkspace data={data}/>
      </section>
    </AppShell>
  );
}
