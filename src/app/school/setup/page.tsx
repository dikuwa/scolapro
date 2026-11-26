import { BookOpenCheck, CalendarRange, Network, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AcademicCalendarSetup } from "@/features/academics/academic-calendar-setup";
import { AcademicSetupCore } from "@/features/academics/academic-setup-core";
import { AcademicStructureForms } from "@/features/academics/structure-forms";
import { HodScopeConfiguration } from "@/features/academics/hod-scope-configuration";
import { getAcademicCalendarWorkspace } from "@/features/academics/server/academic-calendar";
import { getHodScopeConfiguration } from "@/features/academics/server/hod-scope";
import { getRegisterTeacherCandidates, getSchoolStructure } from "@/features/academics/server/structure";
import { DepartmentActivitiesManager } from "@/features/calendar/department-activities-manager";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getOperationalCalendarWorkspace } from "@/features/calendar/server/operational-calendar";
import { listSchoolRooms } from "@/features/timetable/server/rooms";
import { RoomManagement } from "@/features/timetable/room-management";
import { PromotionRuleManager } from "@/features/assessment/promotion-rule-manager";
import { listPromotionRuleVersions } from "@/features/assessment/server/promotion-rules";
import {
  TimetableCycleSettings,
} from "@/features/timetable/timetable-cycle-settings";
import { getUserContext } from "@/lib/auth/get-user-context";
import { hasAnySchoolRole, schoolLeadershipRoles } from "@/lib/auth/school-capabilities";

export default async function SchoolSetupPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/setup");

  const currentSchoolId =
    context.currentSchoolMembership?.schoolId ??
    context.memberships.find((item) => schoolLeadershipRoles.has(item.roleKey))?.schoolId ??
    null;
  if (!currentSchoolId) redirect("/");

  const schoolMemberships = context.memberships.filter((item) => item.schoolId === currentSchoolId);
  const membership = schoolMemberships.find((item) => schoolLeadershipRoles.has(item.roleKey));
  if (!membership || !hasAnySchoolRole(schoolMemberships, currentSchoolId, schoolLeadershipRoles)) redirect("/");

  const schoolRoleKeys = new Set(schoolMemberships.map((item) => item.roleKey));
  const canManageAcademicStructure = schoolRoleKeys.has("school_admin");
  const currentAcademicYear = await getGovernedAcademicYear(membership.schoolId);
  const requestedYear = Number((await searchParams).year);
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= currentAcademicYear && requestedYear <= currentAcademicYear + 1
    ? requestedYear
    : currentAcademicYear;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [structure, rooms, hodScope, registerTeacherCandidates, departmentCalendar, academicCalendar, promotionRules] = await Promise.all([
    getSchoolStructure(membership.schoolId, academicYear),
    canManageAcademicStructure ? listSchoolRooms(membership.schoolId) : Promise.resolve([]),
    getHodScopeConfiguration(membership.schoolId),
    getRegisterTeacherCandidates(membership.schoolId, today),
    getOperationalCalendarWorkspace({ schoolId: membership.schoolId, academicYear, staffMemberId: membership.staffMemberId, canManageSchool: true, canManageDepartment: true, scopeKind: "department" }),
    getAcademicCalendarWorkspace(membership.schoolId),
    listPromotionRuleVersions(membership.schoolId, academicYear),
  ]);
  const activeHodScopeCount = hodScope.activeHodScopeCount;
  const rotating = structure.timetableCycleMode === "rotating";
  const timetableModeLabel = rotating ? "Rotating cycle" : "Standard week";

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Academic setup · {academicYear}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {canManageAcademicStructure
              ? `Configure ${membership.schoolName}'s academic structure and rules used by enrolment, registers, attendance, timetable, assessment and reporting workflows for ${academicYear}. School document identity and report-card presentation live in School settings.`
              : `Review ${membership.schoolName}'s register structure and configure the timetable day workflow for ${academicYear}. Grade, class and room structure remains administered by the School Admin.`}
          </p>
          {academicYear !== currentAcademicYear ? <p role="status" className="mt-3 rounded-[var(--radius-sm)] bg-brand-soft px-3 py-2 text-xs font-medium text-brand-strong">Editing next-year structure for {academicYear}. This is the configuration used by rollover destinations.</p> : null}
        </div>

        <div className="grid gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border-subtle bg-surface px-4 py-4 shadow-[var(--shadow-xs)] sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Configured grades</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{structure.grades.length}</p>
            </div>
            <span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <BookOpenCheck className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border-subtle bg-surface px-4 py-4 shadow-[var(--shadow-xs)] sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Register classes</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-amber)]">{structure.classes.length}</p>
            </div>
            <span className="scolapro-tone-amber grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <UsersRound className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border-subtle bg-surface px-4 py-4 shadow-[var(--shadow-xs)] sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Active HOD scopes</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{activeHodScopeCount}</p>
            </div>
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <Network className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border-subtle bg-surface px-4 py-4 shadow-[var(--shadow-xs)] sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Timetable workflow</p>
              <p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-sky)]">{timetableModeLabel}</p>
            </div>
            <span className="scolapro-tone-sky grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <CalendarRange className="size-4" aria-hidden="true" />
            </span>
          </div>
        </div>

        <AcademicSetupCore
          timetableModeLabel={timetableModeLabel}
          cycleLength={structure.timetableCycleLength}
          anchorDate={structure.timetableCycleAnchorDate}
          anchorDay={structure.timetableCycleAnchorDay}
          rotating={rotating}
          workflowEditor={
            <TimetableCycleSettings
              section="workflow"
              schoolId={membership.schoolId}
              academicYear={academicYear}
              initialMode={structure.timetableCycleMode}
              initialLength={structure.timetableCycleLength}
              initialAnchorDate={structure.timetableCycleAnchorDate}
              initialAnchorDay={structure.timetableCycleAnchorDay}
            />
          }
          anchorEditor={
            <TimetableCycleSettings
              section="anchor"
              schoolId={membership.schoolId}
              academicYear={academicYear}
              initialMode={structure.timetableCycleMode}
              initialLength={structure.timetableCycleLength}
              initialAnchorDate={structure.timetableCycleAnchorDate}
              initialAnchorDay={structure.timetableCycleAnchorDay}
            />
          }
        />

        <HodScopeConfiguration
          schoolId={membership.schoolId}
          subjects={hodScope.subjects}
          heads={hodScope.heads}
          responsibilities={hodScope.responsibilities}
          portfolios={hodScope.portfolios}
          today={hodScope.today}
        />

        <div className="mt-5">
          <DepartmentActivitiesManager schoolId={membership.schoolId} year={academicYear} terms={departmentCalendar.terms} events={departmentCalendar.events} departments={departmentCalendar.departments} canManage title="Department activities" />
        </div>

        {canManageAcademicStructure ? <div className="mt-5"><PromotionRuleManager schoolId={membership.schoolId} academicYear={academicYear} grades={structure.grades.map((grade) => ({ id: grade.id, name: grade.name }))} rules={promotionRules} /></div> : null}

        {canManageAcademicStructure ? (
          <div className="mt-5">
            <AcademicCalendarSetup
              schoolId={membership.schoolId}
              workspace={academicCalendar}
              today={today}
            />
          </div>
        ) : null}

        <div className={`mt-5 grid gap-5 ${canManageAcademicStructure ? "xl:grid-cols-2" : ""} xl:items-start`}>
          <AcademicStructureForms
            schoolId={membership.schoolId}
            academicYear={academicYear}
            grades={structure.grades}
            rooms={rooms}
            classes={structure.classes}
            staff={registerTeacherCandidates}
            canEditStructure={canManageAcademicStructure}
          />
          {canManageAcademicStructure ? (
            <div className="[&>section]:mt-0">
              <RoomManagement schoolId={membership.schoolId} rooms={rooms} />
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
