import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AssessmentSchemeConfigurationWorkspace } from "@/features/assessment/scheme-configuration-workspace";
import { getAssessmentSchemeWorkspace } from "@/features/assessment/server/scheme-configuration";

export default async function AssessmentSchemeConfigurationPage() {
  const data=await getAssessmentSchemeWorkspace();
  if (!data) redirect("/assessment");
  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Assessment scheme configuration</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Configure subject- and grade-specific assessment schemes from the linked curriculum version. Extracted or manual candidates require human verification before publication.</p>
        </div>
        <AssessmentSchemeConfigurationWorkspace data={data}/>
      </section>
    </AppShell>
  );
}
