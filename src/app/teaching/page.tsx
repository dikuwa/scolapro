import Link from "next/link";
import { ArrowUpRight, BookOpenCheck, CalendarDays, ClipboardCheck, UserRoundCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getTeachingWorkspaceOverview } from "@/features/academics/server/workspace-overview";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function TeachingPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching");
  if (context.platformMemberships.length) redirect("/");

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const academicYear = new Date().getFullYear();
  const overview = await getTeachingWorkspaceOverview(membership.schoolId, academicYear);
  const canManage = ["school_admin", "principal", "deputy_principal", "hod"].includes(membership.roleKey);

  const metrics = [
    { label: "Teacher allocations", value: overview.allocations, icon: UserRoundCheck },
    { label: "Pacing plans", value: overview.pacingPlans, icon: BookOpenCheck },
    { label: "Scheduled lessons", value: overview.scheduledLessons, icon: CalendarDays },
    { label: "Prepared lessons", value: overview.preparedLessons, icon: ClipboardCheck },
  ];

  return (
    <AppShell>
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Teaching</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Curriculum pacing, lesson preparation and delivery follow the school&apos;s governed teacher allocations for {academicYear}.</p></div>
          <Link href="/timetable" className="scolapro-cta inline-flex min-h-10 items-center gap-2 self-start bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong">Open timetable<ArrowUpRight className="size-4" /></Link>
        </div>
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }, index) => <article key={label} className={["flex items-center justify-between gap-4 px-4 py-4", index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""].join(" ")}><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1.5 text-xl font-semibold text-foreground">{value}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><Icon className="size-4" /></span></article>)}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <section className="rounded-[var(--radius-md)] bg-surface-muted p-5"><h2 className="scolapro-section-title">Planning</h2><p className="scolapro-section-description">Use current subject offerings and teacher allocations as the source for pacing and lesson preparation.</p><Link href="/timetable" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong">Review allocations<ArrowUpRight className="size-3.5" /></Link></section>
          <section className="rounded-[var(--radius-md)] bg-surface-muted p-5"><h2 className="scolapro-section-title">Delivery</h2><p className="scolapro-section-description">Scheduled lessons and teaching actuals remain linked so curriculum coverage can be reconciled instead of manually duplicated.</p></section>
          <section className="rounded-[var(--radius-md)] bg-surface-muted p-5"><h2 className="scolapro-section-title">{canManage ? "Academic oversight" : "My teaching scope"}</h2><p className="scolapro-section-description">{canManage ? "Leadership can oversee pacing and preparation while teacher-owned delivery stays allocation scoped." : "Only teaching work connected to your active school allocation is available to you."}</p></section>
        </div>
      </section>
    </AppShell>
  );
}
