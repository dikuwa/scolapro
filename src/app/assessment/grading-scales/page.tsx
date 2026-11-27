import { redirect } from "next/navigation";
import { AppBackLink } from "@/components/navigation/app-back-link";
import { AppShell } from "@/components/shell/app-shell";
import { SchoolGradingScalesView } from "@/features/assessment/school-grading-scales-view";
import { getSchoolGradingScales } from "@/features/assessment/server/school-grading-scales";

export default async function SchoolGradingScalesPage() {
  const scales = await getSchoolGradingScales();
  if (!scales) redirect("/assessment");
  return <AppShell><section className="space-y-5">
    <AppBackLink href="/assessment" label="Assessment" />
    <div>
      <h1 className="scolapro-page-title">School grading scales</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
        Configure and version school-authorized grading bands before results become official. Draft values require explicit review and activation. Activated scales and their bands are immutable.
      </p>
    </div>
    <SchoolGradingScalesView scales={scales} />
  </section></AppShell>;
}
