import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { StaffLeaveWorkspaceView } from "@/features/staff/leave/staff-leave-workspace";
import { getStaffLeaveWorkspace } from "@/features/staff/leave/server/workspace";
import { getUserContext } from "@/lib/auth/get-user-context";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const employeeRoles = new Set([
  "school_admin",
  "principal",
  "deputy_principal",
  "hod",
  "teacher",
  "class_teacher",
  "counsellor",
  "learner_support",
  "social_worker",
  "librarian",
  "ltsm",
  "exam_officer",
  "emis_officer",
]);

export default async function StaffLeavePage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/staff/leave");

  const membership = context.currentSchoolMembership;
  if (!membership || !employeeRoles.has(membership.roleKey)) redirect("/");

  const canManage =
    context.platformMemberships.some((item) => item.roleKey === "platform_admin") ||
    context.memberships.some((item) => item.schoolId === membership.schoolId && managerRoles.has(item.roleKey));

  if (!membership.staffMemberId && !canManage) redirect("/staff");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const workspace = await getStaffLeaveWorkspace(membership.schoolId, today, canManage);

  return (
    <AppShell>
      <section>
        <Link href="/staff" className="mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-xs font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground">
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Staff directory
        </Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Staff Leave & Absence</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Govern requests, evidence, approval history and ledger-derived leave balances while keeping operational staff absence separate from timetable and calendar truth.
          </p>
        </div>
        <StaffLeaveWorkspaceView
          schoolId={membership.schoolId}
          viewerStaffId={membership.staffMemberId}
          canManage={canManage}
          today={today}
          workspace={workspace}
        />
      </section>
    </AppShell>
  );
}
