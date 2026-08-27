import { CalendarCheck2, ClipboardCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DailyRegister } from "@/features/attendance/daily-register";
import { getDailyRegisterWorkspace } from "@/features/attendance/server/register";
import { getUserContext } from "@/lib/auth/get-user-context";

function windhoekDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function safeDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : windhoekDate();
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string | string[]; date?: string | string[] }>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/attendance");

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const params = await searchParams;
  const requestedClass = Array.isArray(params.class) ? params.class[0] : params.class;
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = safeDate(requestedDate);
  const academicYear = Number(date.slice(0, 4));

  const workspace = await getDailyRegisterWorkspace(
    membership.schoolId,
    academicYear,
    requestedClass ?? null,
    date,
  );

  const selectedClass = workspace.classes.find((item) => item.id === workspace.selectedClassId);
  const exceptionCount = workspace.learners.filter((item) => item.status !== "present").length;
  const registerKey = `${workspace.selectedClassId ?? "none"}:${date}:${workspace.currentSubmissionId ?? "draft"}`;

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em]">Attendance</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Record the daily class register quickly. Attendance date stays separate from the time it is captured, so backdated registers remain valid and auditable.
          </p>
        </div>

        <div className="mb-5 grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Register class</p><p className="mt-1.5 text-sm font-semibold">{selectedClass?.name ?? "Not configured"}</p></div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong"><UsersRound className="size-4" aria-hidden="true" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Learners</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{workspace.learners.length}</p></div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong"><ClipboardCheck className="size-4" aria-hidden="true" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Exceptions</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{exceptionCount}</p></div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong"><CalendarCheck2 className="size-4" aria-hidden="true" /></span>
          </div>
        </div>

        <DailyRegister
          key={registerKey}
          classes={workspace.classes}
          selectedClassId={workspace.selectedClassId}
          attendanceDate={date}
          learners={workspace.learners}
          reasons={workspace.reasons}
          currentSubmissionId={workspace.currentSubmissionId}
        />
      </section>
    </AppShell>
  );
}
