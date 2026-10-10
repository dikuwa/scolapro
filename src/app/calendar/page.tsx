import { CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { OperationalCalendarManager } from "@/features/calendar/operational-calendar-manager";
import { TeachingImpactManager } from "@/features/calendar/teaching-impact-manager";
import { getGovernedAcademicYear, getSchoolCalendar } from "@/features/calendar/server/calendar";
import { getOperationalCalendarWorkspace } from "@/features/calendar/server/operational-calendar";
import { getTeachingImpactWorkspace } from "@/features/calendar/server/teaching-impact";
import { getUserContext } from "@/lib/auth/get-user-context";

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

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">School Calendar</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Learner opening/closing dates are the operational school calendar for {membership.schoolName}; teacher dates remain administrative.
            School activities and HOD/department deadlines are informational by default, while approved calendar adjustments change learner attendance and timetable resolution.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Academic year</p>
              <p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-indigo)]">{year}</p>
            </div>
            <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Configured terms</p>
              <p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-mint)]">{calendar.terms.length}</p>
            </div>
            <span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><CheckCircle2 className="size-4" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">School / department events</p>
              <p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-amber)]">{operational.events.length}</p>
            </div>
            <span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" /></span>
          </div>
        </div>

        <div className="mt-5">
          <OperationalCalendarManager
            schoolId={membership.schoolId}
            year={year}
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
        </div>

        <TeachingImpactManager
          schoolId={membership.schoolId}
          year={year}
          schedules={teachingImpact.schedules}
          events={teachingImpact.events}
          overrides={teachingImpact.overrides}
          audienceOptions={teachingImpact.audienceOptions}
          canManage={canManageSchool}
        />
      </section>
    </AppShell>
  );
}
