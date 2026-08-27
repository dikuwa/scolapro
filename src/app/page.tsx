import Link from "next/link";
import { ArrowUpRight, BookOpenCheck, Building2, School, ShieldCheck, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getDashboardOverview } from "@/features/dashboard/server/overview";
import { getPlatformTenants } from "@/features/platform/server/tenants";
import { getUserContext } from "@/lib/auth/get-user-context";
import { isSupabaseConfigured } from "@/lib/config/runtime";

function getWindhoekNow() {
  const parts = new Intl.DateTimeFormat("en-NA", {
    timeZone: "Africa/Windhoek",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return { greeting, dateLabel: `${value("weekday")}, ${value("day")} ${value("month")}` };
}

export default async function Home() {
  const { greeting, dateLabel } = getWindhoekNow();
  let displayName = "ScolaPro User";
  let schoolName = "ScolaPro Demonstration School";
  let roleLabel = "Design preview";
  let dashboardMode: "school" | "platform" = "school";
  let primaryHref = "/learners";
  let primaryLabel = "Open learners";
  const academicYear = new Date().getFullYear();
  let overview = { currentLearners: 2, gradeCount: 5, registerClassCount: 2 };
  let platformOverview = { activeTenants: 0, schoolCount: 0 };
  let isPreview = true;

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (!context.user) redirect("/login");
    displayName = context.displayName ?? displayName;
    const membership = context.memberships[0];
    if (membership) {
      schoolName = membership.schoolName;
      roleLabel = membership.roleKey.replaceAll("_", " ");
      overview = await getDashboardOverview(membership.schoolId, academicYear);
      isPreview = false;
    } else if (context.platformMemberships.length) {
      schoolName = "ScolaPro Platform";
      roleLabel = context.platformMemberships[0].roleKey.replaceAll("_", " ");
      dashboardMode = "platform";
      primaryHref = "/platform/tenants";
      primaryLabel = "Manage tenants";
      const tenants = await getPlatformTenants();
      platformOverview = {
        activeTenants: tenants.filter((tenant) => tenant.status === "active").length,
        schoolCount: tenants.reduce((total, tenant) => total + tenant.schools.length, 0),
      };
      isPreview = false;
    }
  }

  const firstName = displayName.split(/\s+/).filter(Boolean)[0] || displayName;
  const metrics = dashboardMode === "platform"
    ? [
        { label: "Active tenants", value: platformOverview.activeTenants.toLocaleString("en-NA"), detail: "Organizations using ScolaPro", icon: Building2, tone: "scolapro-tone-brand" },
        { label: "Registered schools", value: platformOverview.schoolCount.toLocaleString("en-NA"), detail: "Schools across current tenants", icon: School, tone: "scolapro-tone-mint" },
        { label: "Platform access", value: "Admin", detail: "Tenant onboarding and governance", icon: ShieldCheck, tone: "scolapro-tone-amber" },
      ]
    : [
        { label: "Current learners", value: overview.currentLearners.toLocaleString("en-NA"), detail: `Academic year ${academicYear}`, icon: Users, tone: "scolapro-tone-brand" },
        { label: "Configured grades", value: overview.gradeCount.toLocaleString("en-NA"), detail: "Available in this school context", icon: BookOpenCheck, tone: "scolapro-tone-mint" },
        { label: "Register classes", value: overview.registerClassCount.toLocaleString("en-NA"), detail: "Current academic-year structure", icon: School, tone: "scolapro-tone-amber" },
      ];

  const contextTitle = dashboardMode === "platform" ? "Platform context" : "School context";
  const contextDescription = dashboardMode === "platform"
    ? "This dashboard reflects platform-wide tenant scope while tenant and school data remain isolated for ordinary members."
    : "The dashboard reflects the authenticated school scope rather than hard-coded tenant information.";
  const contextLabel = dashboardMode === "platform" ? "Scope" : "School";
  const verticalTitle = dashboardMode === "platform" ? "Tenant administration" : "First vertical slice";
  const verticalDescription = dashboardMode === "platform"
    ? "Tenant and first-school onboarding is now an authenticated, audit-safe platform workflow backed by PostgreSQL authorization."
    : "Learner identity and enrolment are the first operational workflow being proven through authentication, RLS and audit-safe writes.";
  const verticalHref = dashboardMode === "platform" ? "/platform/tenants" : "/learners";
  const verticalLabel = dashboardMode === "platform" ? "Review tenants" : "Review learners";

  return (
    <AppShell>
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em] text-foreground">{greeting}, {firstName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{dateLabel} · {schoolName}</p>
          </div>
          <Link href={primaryHref} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 self-start bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong sm:self-auto">
            {primaryLabel}<ArrowUpRight aria-hidden="true" className="scolapro-cta-icon size-4" />
          </Link>
        </div>

        {isPreview ? <div className="mb-4 rounded-[var(--radius-sm)] bg-info-soft px-4 py-3 text-xs leading-5 text-[color:var(--info)]">Design preview uses synthetic school data. Connect the dedicated ScolaPro Supabase environment to switch this dashboard to authenticated RLS-backed data.</div> : null}

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className={["flex items-start justify-between gap-4 px-4 py-4 sm:px-5", index > 0 ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""].join(" ")}>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-[clamp(1.45rem,1.2rem+0.55vw,1.9rem)] font-semibold tracking-[-0.04em] text-foreground">{metric.value}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
                </div>
                <span className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] ${metric.tone}`}><Icon aria-hidden="true" className="size-[1.05rem]" strokeWidth={1.8} /></span>
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
          <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-sm font-semibold tracking-[-0.015em]">{contextTitle}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{contextDescription}</p></div>
              <span className="w-fit rounded-[var(--radius-xs)] bg-surface px-2.5 py-1.5 text-xs font-medium capitalize text-muted-foreground shadow-[var(--shadow-xs)]">{roleLabel}</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-sm)] bg-surface px-4 py-3.5 shadow-[var(--shadow-xs)]"><p className="text-xs font-medium text-muted-foreground">{contextLabel}</p><p className="mt-1.5 text-sm font-medium text-foreground">{schoolName}</p></div>
              <div className="rounded-[var(--radius-sm)] bg-surface px-4 py-3.5 shadow-[var(--shadow-xs)]"><p className="text-xs font-medium text-muted-foreground">Academic year</p><p className="mt-1.5 text-sm font-medium tabular-nums text-foreground">{academicYear}</p></div>
            </div>
          </section>

          <section className="rounded-[var(--radius-md)] bg-[color:var(--accent-sky-soft)] p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <h2 className="text-sm font-semibold tracking-[-0.015em]">{verticalTitle}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{verticalDescription}</p>
            <Link href={verticalHref} className="scolapro-cta mt-4 inline-flex min-h-9 items-center gap-2 bg-surface/80 px-3 text-xs font-medium text-brand-strong hover:bg-brand-soft">
              {verticalLabel}<ArrowUpRight aria-hidden="true" className="scolapro-cta-icon size-3.5" />
            </Link>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
