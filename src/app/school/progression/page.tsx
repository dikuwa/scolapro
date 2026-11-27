import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProgressionWorkspace } from "@/features/progression/progression-workspace";
import { getProgressionWorkspace, type ProgressionWorkspace as ProgressionWorkspaceData } from "@/features/progression/server/workspace";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";
import { getRolloverReadiness } from "@/features/progression/server/rollover-readiness";
import { RolloverReadinessPanel } from "@/features/progression/rollover-readiness-panel";

const progressionRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const approvalRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function ProgressionPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/progression");
  if (context.platformMemberships.length || !context.currentSchoolMembership) redirect("/");
  const role = context.currentSchoolMembership.roleKey;
  if (!progressionRoles.has(role)) redirect("/");

  const schoolId = context.currentSchoolMembership.schoolId;
  const academicYear = await getGovernedAcademicYear(schoolId);
  const params = await searchParams;
  let workspace: ProgressionWorkspaceData;
  let readiness;
  try {
    workspace = await getProgressionWorkspace(schoolId, academicYear, params.grade ?? null);
    readiness = await getRolloverReadiness(schoolId, academicYear);
  } catch (error) {
    // Diagnose the cause without learner-identifying detail. The workspace shows a
    // neutral reload message so no partial or fabricated progression state leaks.
    console.error("progression.workspace.load_failure", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return (
      <AppShell>
        <div className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
          <h1 className="scolapro-page-title text-xl">Year-end progression</h1>
          <p role="alert" className="mt-2 rounded-[var(--radius-sm)] bg-danger-soft p-3 text-xs font-medium text-[color:var(--danger)]">The progression workspace could not be loaded. Reload the page; if it persists, verify the academic year and promotion rule-set configuration.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-5"><RolloverReadinessPanel rows={readiness} setupHref={`/school/setup?year=${academicYear + 1}`} /></div>
      <ProgressionWorkspace workspace={workspace} canApprove={approvalRoles.has(role)} today={getNamibiaDateKey()} />
    </AppShell>
  );
}
