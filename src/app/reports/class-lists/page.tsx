import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ClassListWorkspace } from "@/features/reporting/class-list-workspace";
import { getClassListWorkspace } from "@/features/reporting/server/class-lists";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function ClassListsPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/reports/class-lists");
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor", "librarian", "exam_officer"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");
  const params = await searchParams;
  const requestedYear = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200 ? requestedYear : new Date().getFullYear();
  const workspace = await getClassListWorkspace(membership.schoolId, academicYear, membership.roleKey);

  return <AppShell><section><div className="mb-6 print:mb-4"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Class lists</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground print:hidden">Build a role-aware learner list, preview it, then print or download a spreadsheet-friendly CSV.</p></div><ClassListWorkspace academicYear={academicYear} schoolName={membership.schoolName} {...workspace} /></section></AppShell>;
}

