import { BookOpenCheck, CalendarDays, Clock3, UserRoundCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { TimetableWorkspaceView } from "@/features/timetable/timetable-workspace";
import { getTimetableWorkspace } from "@/features/timetable/server/workspace";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function TimetablePage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/timetable");
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const academicYear = new Date().getFullYear();
  const workspace = await getTimetableWorkspace(membership.schoolId, academicYear);
  const canManage = membership.roleKey === "school_admin";

  return (
    <AppShell>
      <section>
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Timetable</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{canManage ? "Configure subjects, teacher allocations, school periods and conflict-safe timetable slots from one connected workspace." : "View the current school timetable generated from governed subject and teacher allocations."}</p></div>
        <div className="mb-5 grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-4">
          <div className="flex items-center justify-between gap-3 px-4 py-4"><div><p className="text-xs font-medium text-muted-foreground">Subjects</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-indigo)]">{workspace.subjects.length}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><BookOpenCheck className="size-4" /></span></div>
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Allocations</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-mint)]">{workspace.allocations.length}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><UserRoundCheck className="size-4" /></span></div>
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Periods</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-amber)]">{workspace.periods.length}</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" /></span></div>
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Scheduled slots</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-sky)]">{workspace.slots.length}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" /></span></div>
        </div>
        <TimetableWorkspaceView schoolId={membership.schoolId} academicYear={academicYear} canManage={canManage} viewerStaffId={membership.staffMemberId} workspace={workspace} />
      </section>
    </AppShell>
  );
}