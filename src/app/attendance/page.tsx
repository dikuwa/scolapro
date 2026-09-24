import { CalendarCheck2, ClipboardCheck, UsersRound } from "lucide-react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { renderOfficialDocumentVerificationQrSvg } from "@/features/documents/server/official-document-verification";
import { AttendanceSortControl } from "@/features/attendance/attendance-sort-control";
import { AttendanceViewTabs } from "@/features/attendance/attendance-view-tabs";
import { AbsenceOverview } from "@/features/attendance/absence-overview";
import { DailyRegister } from "@/features/attendance/daily-register";
import { OfficialSummary } from "@/features/attendance/official-summary";
import { WeeklyRegister } from "@/features/attendance/weekly-register";
import { getAbsenceOverviewWorkspace } from "@/features/attendance/server/absence-overview";
import { getDailyRegisterWorkspace, type AttendanceSortDirection } from "@/features/attendance/server/register";
import { getOfficialAttendanceSummary } from "@/features/attendance/server/official-summary";
import { getOfficialAttendanceSummaryFinalization } from "@/features/attendance/server/finalization";
import { getWeeklyRegisterWorkspace, mondayFor } from "@/features/attendance/server/week";
import { getUserContext } from "@/lib/auth/get-user-context";
import "./attendance-mobile.css";

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

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ class?: string | string[]; date?: string | string[]; view?: string | string[]; sort?: string | string[]; term?: string | string[]; mode?: string | string[] }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/attendance");

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");
  const canFinalize = ["principal", "deputy_principal", "school_admin"].includes(membership.roleKey);

  const params = await searchParams;
  const requestedClass = Array.isArray(params.class) ? params.class[0] : params.class;
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const requestedSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const requestedTerm = Array.isArray(params.term) ? params.term[0] : params.term;
  const requestedMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const view = requestedView === "week" ? "week" : requestedView === "official" ? "official" : requestedView === "absences" ? "absences" : "day";
  const mode: "week" | "term" = requestedMode === "term" ? "term" : "week";
  const sort: AttendanceSortDirection = requestedSort === "desc" ? "desc" : "asc";
  const date = safeSchoolDate(requestedDate);
  const academicYear = Number(date.slice(0, 4));

  return (
    <AppShell>
      <Suspense fallback={<AttendanceLoading />}>
        <AttendanceWorkspaceData
          schoolId={membership.schoolId}
          tenantId={membership.tenantId}
          userId={context.user.id}
          academicYear={academicYear}
          requestedClass={requestedClass}
          date={date}
          view={view}
          sort={sort}
          mode={mode}
          requestedTerm={requestedTerm}
          canFinalize={canFinalize}
        />
      </Suspense>
    </AppShell>
  );
}

async function AttendanceWorkspaceData({
  schoolId,
  tenantId,
  userId,
  academicYear,
  requestedClass,
  date,
  view,
  sort,
  mode,
  requestedTerm,
  canFinalize,
}: {
  schoolId: string;
  tenantId: string;
  userId: string;
  academicYear: number;
  requestedClass?: string;
  date: string;
  view: "day" | "week" | "official" | "absences";
  sort: AttendanceSortDirection;
  mode: "week" | "term";
  requestedTerm?: string;
  canFinalize: boolean;
}) {
if (view === "official") {
  const summary = await getOfficialAttendanceSummary(schoolId, academicYear, mode, date, requestedTerm ?? null);
  const finalization = await getOfficialAttendanceSummaryFinalization({
    schoolId,
    mode,
    scopeStart: summary.scopeStart,
    scopeEnd: summary.scopeEnd,
    termId: requestedTerm ?? null,
  });

  let qrSvg: string | null = null;
  if (finalization) {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host") ?? "localhost:3000";
    const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
    qrSvg = await renderOfficialDocumentVerificationQrSvg({ token: finalization.verificationToken, origin: `${proto}://${host}` });
  }

  return (
    <section className="attendance-page">
      <AttendanceHeader date={date} requestedClass={requestedClass} view="official" sort={sort} />
      <OfficialSummary
        summary={summary}
        date={date}
        mode={mode}
        schoolId={schoolId}
        academicYear={academicYear}
        termId={requestedTerm ?? null}
        canFinalize={canFinalize}
        finalization={finalization}
        qrSvg={qrSvg}
      />
    </section>
  );
}

if (view === "absences") {
  const workspace = await getAbsenceOverviewWorkspace(schoolId, academicYear, date, requestedClass ?? null);
  const selectedClass = workspace.classes.find((item) => item.id === workspace.selectedClassId);
  return (
    <section className="attendance-page">
        <AttendanceHeader date={date} requestedClass={requestedClass} view="absences" sort={sort} />
        <p className="mb-5 text-sm leading-6 text-muted-foreground">A read-only absence view. It combines official daily-register absences, lesson absences and parent/guardian notices for {selectedClass ? `${selectedClass.grade} ${selectedClass.name}` : "your school"} — it never changes the records it reads.</p>
        <AbsenceOverview classes={workspace.classes} selectedClassId={workspace.selectedClassId} rows={workspace.rows} attendanceDate={date} />
    </section>
  );
}

if (view === "week") {
  const workspace = await getWeeklyRegisterWorkspace(schoolId, academicYear, requestedClass ?? null, mondayFor(date), sort);
  const selectedClass = workspace.classes.find((item) => item.id === workspace.selectedClassId);
  const exceptionCount = workspace.learners.reduce((total, learner) => total + learner.days.filter((day) => day.status !== "present").length, 0);
  return (
    <section className="attendance-page">
        <AttendanceHeader date={date} requestedClass={requestedClass} view="week" sort={sort} />
        <Summary selectedClassName={selectedClass?.name} learnerCount={workspace.learners.length} exceptionCount={exceptionCount} exceptionLabel="Weekly exceptions" />
        <WeeklyRegister classes={workspace.classes} selectedClassId={workspace.selectedClassId} dates={workspace.dates} learners={workspace.learners} reasons={workspace.reasons} submissionIds={workspace.submissionIds} nonTeachingDates={workspace.nonTeachingDates} nonTeachingReasons={workspace.nonTeachingReasons} />
    </section>
  );
}

const workspace = await getDailyRegisterWorkspace(schoolId, academicYear, requestedClass ?? null, date, sort);
const selectedClass = workspace.classes.find((item) => item.id === workspace.selectedClassId);
const exceptionCount = workspace.learners.filter((item) => item.status !== "present").length;
return (
  <section className="attendance-page">
      <AttendanceHeader date={date} requestedClass={requestedClass} view="day" sort={sort} />
      <Summary selectedClassName={selectedClass?.name} learnerCount={workspace.learners.length} exceptionCount={exceptionCount} exceptionLabel="Exceptions" />
      <DailyRegister key={`${workspace.selectedClassId ?? "none"}:${date}:${workspace.currentSubmissionId ?? "draft"}:${sort}`} classes={workspace.classes} selectedClassId={workspace.selectedClassId} attendanceDate={date} learners={workspace.learners} reasons={workspace.reasons} currentSubmissionId={workspace.currentSubmissionId} teachingDay={workspace.teachingDay} offlineScope={{ userId, tenantId, schoolId }} />
  </section>
);
}

function AttendanceLoading() {
  return (
    <section className="attendance-page" aria-busy="true">
      <div className="mb-6">
        <div className="h-8 w-40 animate-pulse rounded-[var(--radius-xs)] bg-surface-muted" />
        <div className="mt-2 h-4 w-full max-w-2xl animate-pulse rounded-[var(--radius-xs)] bg-surface-muted" />
      </div>
      <div className="mb-5 grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-border-subtle sm:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse bg-surface" />)}
      </div>
      <div className="h-72 animate-pulse rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted" />
    </section>
  );
}

function AttendanceHeader({ date, requestedClass, view, sort }: { date: string; requestedClass?: string; view: "day" | "week" | "official" | "absences"; sort: AttendanceSortDirection }) {
  return (
    <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Attendance</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Fast exception-first registers, a Monday–Friday weekly view, the official weekly/term absence summary, or all absences for a day.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {view !== "absences" ? <AttendanceSortControl sort={sort} /> : null}
        <AttendanceViewTabs view={view} date={date} requestedClass={requestedClass} weekDate={mondayFor(date)} sort={sort} />
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
