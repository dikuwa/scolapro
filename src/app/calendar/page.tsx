import { CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSchoolCalendar } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

function dateLabel(value: string | null) {
  if (!value) return "Not configured";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

export default async function CalendarPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/calendar");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const year = new Date().getFullYear();
  const calendar = await getSchoolCalendar(membership.schoolId, year);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Calendar</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Academic-year and term context for {membership.schoolName}. Normal register weeks use Monday to Friday; weekends are excluded unless a school explicitly records a special school event.</p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Academic year</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-indigo)]">{year}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Configured terms</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-mint)]">{calendar.terms.length}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><CheckCircle2 className="size-4" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Register week</p><p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-amber)]">Monday–Friday</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" /></span></div>
        </div>

        <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="border-b border-border-subtle pb-4"><h2 className="scolapro-section-title">Academic calendar structure</h2><p className="scolapro-section-description">Term dates become the shared source for attendance, teaching plans, assessments, reporting and timetable capacity.</p></div>
          {calendar.academicYear ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Year starts</p><p className="mt-1 scolapro-record-title">{dateLabel(calendar.academicYear.startsOn)}</p></div><div><p className="text-xs text-muted-foreground">Year ends</p><p className="mt-1 scolapro-record-title">{dateLabel(calendar.academicYear.endsOn)}</p></div><div><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 scolapro-record-title capitalize">{calendar.academicYear.status}</p></div></div>
              <div className="divide-y divide-border-subtle">{calendar.terms.map((term) => <div key={term.id} className="grid gap-2 py-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-center"><p className="scolapro-record-title">{term.name}</p><p className="text-xs text-muted-foreground">{dateLabel(term.startsOn)}</p><p className="text-xs text-muted-foreground">{dateLabel(term.endsOn)}</p><span className="w-fit rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs capitalize text-muted-foreground">{term.status}</span></div>)}</div>
            </div>
          ) : (
            <div className="mt-4 rounded-[var(--radius-sm)] bg-warning-soft px-4 py-5"><p className="text-sm font-medium text-[color:var(--warning)]">Academic year dates are not configured yet</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The calendar route is available now. School calendar configuration will continue from the existing academic-year and term foundation.</p></div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
