import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ClassListWorkspace } from "@/features/learners/class-list-workspace";
import type { ClassListColumnId, ClassListRosterType, ClassListTarget } from "@/features/learners/class-list-types";
import { canAccessClassLists, getClassListBatchWorkspace, getClassListWorkspace } from "@/features/learners/server/class-list-workspace";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

function parseTargets(value: string | string[] | undefined): ClassListTarget[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((entry) => entry.split(",")).map((entry) => {
    const separator = entry.indexOf(":");
    if (separator <= 0) return null;
    return {
      rosterType: entry.slice(0, separator) as ClassListRosterType,
      rosterId: entry.slice(separator + 1),
    };
  }).filter((target): target is ClassListTarget => Boolean(target?.rosterId));
}

export default async function ClassListsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/class-lists");
  const membership = context.currentSchoolMembership;
  if (!membership || !canAccessClassLists(membership)) redirect("/");
  const params = await searchParams;
  const academicYear = await getGovernedAcademicYear(membership.schoolId);
  const scope = single(params.scope) === "my" ? "my" : "all";
  const columns = (single(params.columns) ?? "admissionNumber,sex,registerClass,status").split(",") as ClassListColumnId[];
  const blankColumns = Number(single(params.blankColumns) ?? 0);
  const requestedTargets = parseTargets(params.target);
  const fallbackRosterType = (single(params.rosterType) ?? requestedTargets[0]?.rosterType ?? "register_class") as ClassListRosterType;
  const fallbackRosterId = single(params.rosterId) ?? requestedTargets[0]?.rosterId ?? "";
  const data = await getClassListWorkspace({ membership, academicYear, configuration: {
    scope,
    rosterType: fallbackRosterType,
    rosterId: fallbackRosterId,
    columns,
    blankColumns,
  } });
  const targets = requestedTargets.length
    ? requestedTargets
    : data.configuration.rosterId
      ? [{ rosterType: data.configuration.rosterType, rosterId: data.configuration.rosterId }]
      : [];
  const batch = targets.length
    ? await getClassListBatchWorkspace({ membership, academicYear, scope, targets, columns, blankColumns })
    : { targets: [], lists: [], totalLearners: 0 };
  return <AppShell><div className="space-y-5"><div><h1 className="scolapro-page-title">Class Lists</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Build one or many governed class lists, preview each roster independently, then print or export the current batch.</p></div><ClassListWorkspace data={data} batch={batch} /></div></AppShell>;
}
