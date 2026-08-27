import Link from "next/link";
import { CalendarCheck2, ClipboardCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { DailyRegister } from "@/features/attendance/daily-register";
import { WeeklyRegister } from "@/features/attendance/weekly-register";
import { getDailyRegisterWorkspace } from "@/features/attendance/server/register";
import { getWeeklyRegisterWorkspace, mondayFor } from "@/features/attendance/server/week";
import { getUserContext } from "@/lib/auth/get-user-context";

function windhoekDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function safeSchoolDate(value?: string) {
  const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : windhoekDate();
  const parsed = new Date(`${date}T12:00:00`);
  if (parsed.getDay() === 6) parsed.setDate(parsed.getDate() - 1);
  if (parsed.getDay() === 0) parsed.setDate(parsed.getDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ class?: string | string[]; date?: string | string[]; view?: string | string[] }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/attendance");

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const params = await searchParams;
  const requestedClass = Array.isArray(params.class) ? params.class[0] : params.class;
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = requestedView === "week" ? "week" : "day";
  const date = safeSchoolDate(requestedDate);
  const academicYear = Number(date.slice(0, 4));

  if (view === "week") {
    const workspace = await getWeeklyRegisterWorkspace(membership.schoolId, academicYear, requestedClass ?? null, mondayFor(date));
    const selectedClass = workspace.classes.find((item) => item.id === workspace.selectedClassId);
    const exceptionCount = workspace.learners.reduce((total, learner) => total + learner.days.filter((day) => day.status !== "present").length, 0);
    return (
      <AppShell>
        <section>
          <AttendanceHeader date={date} requestedClass={requestedClass} view="week" />
          <Summary selectedClassName={selectedClass?.name} learnerCount={workspace.learners.length} exceptionCount={exceptionCount} exceptionLabel="Weekly exceptions" />
          <WeeklyRegister classes={workspace.classes} selectedClassId={workspace.selectedClassId} dates={workspace.dates} learners={workspace.learners} reasons={workspace.reasons} submissionIds={workspace.submissionIds} />
        </section>
      </AppShell>
    );
  }

  const workspace = await getDailyRegisterWorkspace(membership.schoolId, academicYear, requestedClass ?? null, date);
  const selectedClass = workspace.classes.find((item) => item.id === workspace.selectedClassId);
  const exceptionCount = workspace.learners.filter((item) => item.status !== "present").length;
  return (
    <AppShell>
      <section>
        <AttendanceHeader date={date} requestedClass={requestedClass} view="day" />
        <Summary selectedClassName={selectedClass?.name} learnerCount={workspace.learners.length} exceptionCount={exceptionCount} exceptionLabel="Exceptions" />
        <DailyRegister key={`${workspace.selectedClassId ?? "none"}:${date}:${workspace.currentSubmissionId ?? "draft"}`} classes={workspace.classes} selectedClassId={workspace.selectedClassId} attendanceDate={date} learners={workspace.learners} reasons={workspace.reasons} currentSubmissionId={workspace.currentSubmissionId} />
      </section>
    </AppShell>
  );
}

function AttendanceHeader({ date, requestedClass, view }: { date: string; requestedClass?: string; view: "day" | "week" }) {
  const classParam = requestedClass ? `&class=${encodeURIComponent(requestedClass)}` : "";
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Attendance</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Fast exception-first registers. Capture daily, or reconcile a physical register later with a Monday–Friday weekly view.</p></div>
      <div className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1">
        <Link href={`/attendance?view=day&date=${date}${classParam}`} className={`rounded-[var(--radius-xs)] px-3 py-2 text-xs font-medium transition ${view === "day" ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}>Day</Link>
        <Link href={`/attendance?view=week&date=${mondayFor(date)}${classParam}`} className={`rounded-[var(--radius-xs)] px-3 py-2 text-xs font-medium transition ${view === "week" ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}>Week</Link>
      </div>
    </div>
  );
}

function Summary({ selectedClassName, learnerCount, exceptionCount, exceptionLabel }: { selectedClassName?: string; learnerCount: number; exceptionCount: number; exceptionLabel: string }) {
  return (
    <div className="mb-5 grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Register class</p><p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-indigo)]">{selectedClassName ?? "Not configured"}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span></div>
      <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Learners</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{learnerCount}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><ClipboardCheck className="size-4" aria-hidden="true" /></span></div>
      <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">{exceptionLabel}</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-amber)]">{exceptionCount}</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><CalendarCheck2 className="size-4" aria-hidden="true" /></span></div>
    </div>
  );
}