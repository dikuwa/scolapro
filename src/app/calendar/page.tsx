import { BarChart3, CalendarDays, CheckCircle2, Clock3, RefreshCcw } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { OperationalCalendarManager } from "@/features/calendar/operational-calendar-manager";
import { TeachingImpactManager } from "@/features/calendar/teaching-impact-manager";
import { getGovernedAcademicYear, getSchoolCalendar } from "@/features/calendar/server/calendar";
import { getOperationalCalendarWorkspace } from "@/features/calendar/server/operational-calendar";
import { getTeachingImpactWorkspace } from "@/features/calendar/server/teaching-impact";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

function compactDate(value: string | null) {
  if (!value) return "Not configured";
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}
export default async function CalendarPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/calendar");
  const membership = context.currentSchoolMembership;
  if (!membership) redirect("/");

  const currentSchoolMemberships = context.memberships.filter((item) => item.schoolId === membership.schoolId);
  const currentSchoolRoleKeys = new Set(currentSchoolMemberships.map((item) => item.roleKey));
  const canManageSchool = ["school_admin", "principal", "deputy_principal"].some((roleKey) =>
    currentSchoolRoleKeys.has(roleKey),
  );
  const canManageDepartment = currentSchoolRoleKeys.has("hod") || canManageSchool;
  const hodStaffMemberId =
    currentSchoolMemberships.find((item) => item.roleKey === "hod" && item.staffMemberId)?.staffMemberId ??
    membership.staffMemberId ??
    null;

  const year = await getGovernedAcademicYear(membership.schoolId);
  const [calendar, teachingImpact, operational] = await Promise.all([
    getSchoolCalendar(membership.schoolId, year),
    getTeachingImpactWorkspace(membership.schoolId, year),
    getOperationalCalendarWorkspace({
      schoolId: membership.schoolId,
      academicYear: year,
      staffMemberId: hodStaffMemberId,
      canManageSchool,
      canManageDepartment,
    }),
  ]);

  const resolvedLearnerDays = operational.terms.reduce((total, term) => total + term.calculatedLearnerDayCount, 0);
  const publishedLearnerDays = operational.terms.reduce(
    (total, term) => total + (term.officialLearnerDayCount ?? 0),
    0,
  );
  const learnerDayDifference = publishedLearnerDays ? resolvedLearnerDays - publishedLearnerDays : null;
  const orderedTerms = [...operational.terms].sort((a, b) => a.termNumber - b.termNumber);
  const cycleStart = orderedTerms.find((term) => term.learnerStartsOn)?.learnerStartsOn ?? calendar.academicYear?.startsOn ?? null;
  const cycleEnd = [...orderedTerms].reverse().find((term) => term.learnerEndsOn)?.learnerEndsOn ?? calendar.academicYear?.endsOn ?? null;

  return (
    <AppShell>
      <main className="scolapro-content-width space-y-6">
        <header>
          <h1 className="scolapro-page-title">School calendar</h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            Learner opening and closing dates define the operational calendar for {membership.schoolName}. Teacher dates
            remain administrative, while approved adjustments change attendance and timetable scheduling.
          </p>
        </header>

        <section aria-label="Calendar summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <div className="flex min-h-24 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-4 py-3 shadow-[var(--shadow-xs)]">
            <div><p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Academic year</p><p className="mt-1 text-2xl font-semibold text-[color:var(--accent-indigo)]">{year}</p></div>
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" /></span>
          </div>
          <div className="flex min-h-24 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-4 py-3 shadow-[var(--shadow-xs)]">
            <div><p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Configured terms</p><p className="mt-1 text-2xl font-semibold text-[color:var(--accent-mint)]">{operational.terms.length}</p></div>
            <span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CheckCircle2 className="size-4" /></span>
          </div>
          <div className="flex min-h-24 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-4 py-3 shadow-[var(--shadow-xs)]">
            <div><p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">School / department events</p><p className="mt-1 text-2xl font-semibold text-[color:var(--accent-amber)]">{operational.events.length}</p></div>
            <span className="scolapro-tone-amber grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" /></span>
          </div>
          <div className="flex min-h-24 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-4 py-3 shadow-[var(--shadow-xs)]">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Learner days</p>
              <div className="mt-1 flex items-end gap-1.5"><p className="text-2xl font-semibold tabular-nums">{resolvedLearnerDays}</p>{publishedLearnerDays ? <p className="pb-1 text-xs text-muted-foreground">/ {publishedLearnerDays}</p> : null}</div>
              {learnerDayDifference ? <p className="mt-0.5 text-[0.65rem] font-medium text-[color:var(--warning)]">{learnerDayDifference > 0 ? "+" : ""}{learnerDayDifference} day difference</p> : null}
            </div>
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><BarChart3 className="size-4" /></span>
          </div>
          <div className="col-span-2 flex min-h-24 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-4 py-3 shadow-[var(--shadow-xs)] lg:col-span-1">
            <div><p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Full year cycle</p><p className="mt-1 text-sm font-semibold">{cycleStart && cycleEnd ? `${compactDate(cycleStart)} – ${compactDate(cycleEnd)}` : "Not configured"}</p><p className="mt-1 text-[0.65rem] font-medium text-[color:var(--success)]">Operational cycle</p></div>
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><RefreshCcw className="size-4" /></span>
          </div>
        </section>

        {!calendar.academicYear ? (
          <div role="status" className="rounded-[var(--radius-sm)] border border-[color:var(--warning)]/25 bg-warning-soft px-4 py-3">
            <p className="text-sm font-semibold text-[color:var(--warning)]">Academic year dates are not configured</p>
            <p className="mt-1 text-xs text-muted-foreground">Configure the academic-year foundation before relying on calendar-dependent attendance and timetables.</p>
          </div>
        ) : null}

        <OperationalCalendarManager
          schoolId={membership.schoolId}
          year={year}
          currentDate={getNamibiaDateKey()}
          terms={operational.terms}
          events={operational.events}
          departments={operational.departments}
          staffOptions={operational.staffOptions}
          schedules={teachingImpact.schedules}
          canManageSchool={canManageSchool}
          canManageDepartment={canManageDepartment}
          dayExceptions={teachingImpact.overrides}
          learnerEvents={teachingImpact.events}
        />

        <TeachingImpactManager
          schoolId={membership.schoolId}
          year={year}
          schedules={teachingImpact.schedules}
          events={teachingImpact.events}
          overrides={teachingImpact.overrides}
          audienceOptions={teachingImpact.audienceOptions}
          canManage={canManageSchool}
        />
      </main>
    </AppShell>
  );
}
