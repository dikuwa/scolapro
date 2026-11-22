import { redirect } from "next/navigation";
import { AppBackLink } from "@/components/navigation/app-back-link";
import { AppShell } from "@/components/shell/app-shell";
import { OfficialResultApprovalView } from "@/features/assessment/official-result-approval-view";
import { getOfficialResultApprovalWorkspace } from "@/features/assessment/server/official-result-approval";

type Params = Promise<Record<string, string | string[] | undefined>>;
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OfficialResultsPage({ searchParams }: { searchParams: Params }) {
  const query = await searchParams;
  const workspace = await getOfficialResultApprovalWorkspace({
    offering: first(query.offering),
    scheme: first(query.scheme),
    classId: first(query.class),
    term: first(query.term),
    page: first(query.page),
  });
  if (!workspace) redirect("/assessment");

  return <AppShell><section className="space-y-5">
    <AppBackLink href="/assessment" label="Assessment" />
    <header>
      <h1 className="scolapro-page-title">Official result approval</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
        Approve verified subject results for {workspace.academicYear} using the school&apos;s configured scheme and grading scale. Results remain unpublished until a separate report-card certification and publication.
      </p>
    </header>
    <OfficialResultApprovalView workspace={workspace} />
  </section></AppShell>;
}
