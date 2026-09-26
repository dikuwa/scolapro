import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ClassListWorkspace } from "@/features/learners/class-list-workspace";
import type { ClassListColumnId, ClassListRosterType } from "@/features/learners/class-list-types";
import { canAccessClassLists, getClassListWorkspace } from "@/features/learners/server/class-list-workspace";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ClassListsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/class-lists");
  const membership = context.currentSchoolMembership;
  if (!membership || !canAccessClassLists(membership)) redirect("/");
  const params = await searchParams;
  const academicYear = await getGovernedAcademicYear(membership.schoolId);
  const data = await getClassListWorkspace({ membership, academicYear, configuration: {
    scope: single(params.scope) === "my" ? "my" : "all",
    rosterType: (single(params.rosterType) ?? "register_class") as ClassListRosterType,
    rosterId: single(params.rosterId) ?? "",
    columns: (single(params.columns) ?? "admissionNumber,sex,registerClass,status").split(",") as ClassListColumnId[],
    blankColumns: Number(single(params.blankColumns) ?? 0),
  } });
  return <AppShell><div className="space-y-5"><div><h1 className="scolapro-page-title">Class Lists</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Build a governed roster once, preview it, then print or export the same configured list as PDF or a real Excel workbook.</p></div><ClassListWorkspace data={data} /></div></AppShell>;
}
