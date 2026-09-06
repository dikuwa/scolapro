import { BookOpenCheck, School, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AcademicStructureForms } from "@/features/academics/structure-forms";
import { ClassManagement } from "@/features/academics/class-management";
import { getSchoolStructure } from "@/features/academics/server/structure";
import { RoomManagement } from "@/features/timetable/room-management";
import { TimetableCycleSettings } from "@/features/timetable/timetable-cycle-settings";
import { listSchoolRooms } from "@/features/timetable/server/rooms";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function SchoolSetupPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/setup");

  const membership = context.memberships.find((item) => ["school_admin", "principal"].includes(item.roleKey));
  if (!membership) redirect("/");

  const canManageAcademicStructure = membership.roleKey === "school_admin";
  const academicYear = new Date().getFullYear();
  const [structure, rooms] = await Promise.all([
    getSchoolStructure(membership.schoolId, academicYear),
    canManageAcademicStructure ? listSchoolRooms(membership.schoolId) : Promise.resolve([]),
  ]);

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
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">School</p><p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-indigo)]">{membership.schoolName}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><School className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Configured grades</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{structure.grades.length}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><BookOpenCheck className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Register classes</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-amber)]">{structure.classes.length}</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span></div>
        </div>

        <div className="mt-5">
          <TimetableCycleSettings
            schoolId={membership.schoolId}
            academicYear={academicYear}
            initialMode={structure.timetableCycleMode}
            initialLength={structure.timetableCycleLength}
            initialAnchorDate={structure.timetableCycleAnchorDate}
            initialAnchorDay={structure.timetableCycleAnchorDay}
          />
        </div>

        {canManageAcademicStructure ? (
          <>
            <div className="mt-5"><AcademicStructureForms schoolId={membership.schoolId} academicYear={academicYear} grades={structure.grades} /></div>

            <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4"><div><h2 className="scolapro-section-title">Current register structure</h2><p className="scolapro-section-description">Classes are grouped by grade. Edit incorrect labels/codes here; deletion is allowed only before a class is used by enrolment, attendance or timetable records.</p></div><span className="rounded-[var(--radius-xs)] bg-[color:var(--accent-sky-soft)] px-2 py-1 text-xs font-medium text-[color:var(--accent-sky)]">{academicYear}</span></div>
              <ClassManagement grades={structure.grades} classes={structure.classes} />
            </section>

            <RoomManagement schoolId={membership.schoolId} rooms={rooms} />
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
