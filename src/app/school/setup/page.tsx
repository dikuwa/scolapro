import { BookOpenCheck, School, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AcademicStructureForms } from "@/features/academics/structure-forms";
import { getSchoolStructure } from "@/features/academics/server/structure";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function SchoolSetupPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/setup");

  const membership = context.memberships.find((item) => item.roleKey === "school_admin");
  if (!membership) redirect("/");

  const academicYear = new Date().getFullYear();
  const structure = await getSchoolStructure(membership.schoolId, academicYear);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em]">Academic setup</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Configure the minimal school structure used by enrolment, registers, attendance, timetable and assessment workflows for {academicYear}.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">School</p><p className="mt-1.5 text-sm font-semibold">{membership.schoolName}</p></div>
            <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><School className="size-4" aria-hidden="true" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Configured grades</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{structure.grades.length}</p></div>
            <span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><BookOpenCheck className="size-4" aria-hidden="true" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Register classes</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{structure.classes.length}</p></div>
            <span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span>
          </div>
        </div>

        <div className="mt-5"><AcademicStructureForms schoolId={membership.schoolId} academicYear={academicYear} grades={structure.grades} /></div>

        <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Current register structure</h2>
              <p className="mt-1 text-xs text-muted-foreground">Classes are grouped by their configured grade for this academic year.</p>
            </div>
            <span className="rounded-[var(--radius-xs)] bg-[color:var(--accent-sky-soft)] px-2 py-1 text-xs font-medium text-[color:var(--accent-sky)]">{academicYear}</span>
          </div>

          <div className="mt-4 divide-y divide-border-subtle">
            {structure.grades.map((grade) => {
              const classes = structure.classes.filter((item) => item.gradeId === grade.id);
              return (
                <div key={grade.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(10rem,0.35fr)_1fr] sm:items-start">
                  <div><p className="text-sm font-medium">{grade.name}</p><p className="text-xs text-muted-foreground">{grade.code}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {classes.length ? classes.map((item) => <span key={item.id} className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs font-medium">{item.name}</span>) : <span className="text-xs text-muted-foreground">No register classes yet</span>}
                  </div>
                </div>
              );
            })}
            {!structure.grades.length ? <div className="py-8 text-center text-sm text-muted-foreground">Add the first grade to begin academic setup.</div> : null}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
