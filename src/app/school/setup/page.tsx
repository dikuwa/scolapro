import { BookOpenCheck, School, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AcademicSetupCore } from "@/features/academics/academic-setup-core";
import { AcademicStructureForms } from "@/features/academics/structure-forms";
import { ClassManagement } from "@/features/academics/class-management";
import { getRegisterTeacherCandidates, getSchoolStructure } from "@/features/academics/server/structure";
import { getHodScopeConfiguration } from "@/features/academics/server/hod-scope";
import { HodScopeConfiguration } from "@/features/academics/hod-scope-configuration";
import { RoomManagement } from "@/features/timetable/room-management";
import { TimetableCycleSettings } from "@/features/timetable/timetable-cycle-settings";
import { listSchoolRooms } from "@/features/timetable/server/rooms";
import { getUserContext } from "@/lib/auth/get-user-context";
import { hasAnySchoolRole, schoolLeadershipRoles } from "@/lib/auth/school-capabilities";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

export default async function SchoolSetupPage() {
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
  const academicYear = getNamibiaCalendarYear();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [structure, rooms, hodScope, registerTeacherCandidates] = await Promise.all([
    getSchoolStructure(membership.schoolId, academicYear),
    canManageAcademicStructure ? listSchoolRooms(membership.schoolId) : Promise.resolve([]),
    getHodScopeConfiguration(membership.schoolId),
    getRegisterTeacherCandidates(membership.schoolId, today),
  ]);
  const activeHodScopeCount = hodScope.responsibilities.filter(
    (row) => row.effectiveFrom <= hodScope.today && (!row.effectiveTo || row.effectiveTo >= hodScope.today),
  ).length;

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Academic setup</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {canManageAcademicStructure
              ? `Configure the school structure and academic rules used by enrolment, registers, attendance, timetable, assessment and reporting workflows for ${academicYear}. School document identity and report-card presentation live in School settings.`
              : "Review and configure the school's timetable day workflow. Grade, class and room structure remains administered by the School Admin."}
          </p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">School</p>
              <p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-indigo)]">{membership.schoolName}</p>
            </div>
            <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]">
              <School className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Configured grades</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{structure.grades.length}</p>
            </div>
            <span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]">
              <BookOpenCheck className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Register classes</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-amber)]">{structure.classes.length}</p>
            </div>
            <span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]">
              <UsersRound className="size-4" aria-hidden="true" />
            </span>
          </div>
        </div>

        <AcademicSetupCore
          timetableModeLabel={structure.timetableCycleMode === "rotating" ? "Rotating cycle" : "Standard week"}
          cycleLength={structure.timetableCycleLength}
          anchorDate={structure.timetableCycleAnchorDate}
          anchorDay={structure.timetableCycleAnchorDay}
          rotating={structure.timetableCycleMode === "rotating"}
          hodScopeCount={activeHodScopeCount}
          hodOverview={
            <div className="mt-3 space-y-2">
              {hodScope.portfolios.length ? hodScope.portfolios.map((portfolio) => {
                const appointment = portfolio.appointments.find((item) => item.effectiveFrom <= hodScope.today && (!item.effectiveTo || item.effectiveTo >= hodScope.today));
                return (
                  <div key={portfolio.id} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
                    <p className="text-xs font-semibold text-foreground">{portfolio.label} · {appointment?.headName ?? "Unassigned"}</p>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{portfolio.subjectIds.map((id) => hodScope.subjects.find((subject) => subject.id === id)?.name ?? id).join(", ")}</p>
                  </div>
                );
              }) : <p className="text-xs text-muted-foreground">No subject portfolios configured yet.</p>}
            </div>
          }
          timetableEditor={
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
          hodEditor={
            <HodScopeConfiguration
              schoolId={membership.schoolId}
              subjects={hodScope.subjects}
              heads={hodScope.heads}
              responsibilities={hodScope.responsibilities}
              portfolios={hodScope.portfolios}
              today={hodScope.today}
            />
          }
        />

        {canManageAcademicStructure ? (
          <div className="mt-5">
            <AcademicStructureForms
              schoolId={membership.schoolId}
              academicYear={academicYear}
              grades={structure.grades} rooms={rooms} classes={structure.classes}
            />
          </div>
        ) : null}

        <div className={`mt-5 grid gap-5 ${canManageAcademicStructure ? "xl:grid-cols-2" : ""} xl:items-start`}>
          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
              <div>
                <h2 className="scolapro-section-title">Current register structure</h2>
                <p className="scolapro-section-description">
                  Review grades and register classes here. Register Teacher assignment is available to school leadership; grade/class structure changes remain School Admin controlled.
                </p>
              </div>
              <span className="rounded-[var(--radius-xs)] bg-[color:var(--accent-sky-soft)] px-2 py-1 text-xs font-medium text-[color:var(--accent-sky)]">{academicYear}</span>
            </div>
            <div className="max-h-[33rem] overflow-y-auto overscroll-contain pr-1">
              <ClassManagement grades={structure.grades} classes={structure.classes} rooms={rooms} staff={registerTeacherCandidates} canEditStructure={canManageAcademicStructure} />
            </div>
          </section>

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
