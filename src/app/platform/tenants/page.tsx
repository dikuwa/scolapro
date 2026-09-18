import { Building2, School } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { PlatformTenantConfiguration } from "@/features/platform/tenant-configuration";
import { TenantOnboardingForm } from "@/features/platform/tenant-onboarding-form";
import { getPlatformNetworkOptions, getPlatformTenants } from "@/features/platform/server/tenants";
import { getUserContext } from "@/lib/auth/get-user-context";

function todayInNamibia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function PlatformTenantsPage() {
  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  if (!context.user) redirect("/login?next=/platform/tenants");
  if (!isPlatformAdmin) redirect("/");

  const [tenants, networkOptions] = await Promise.all([
    getPlatformTenants(),
    getPlatformNetworkOptions(),
  ]);
  const schoolCount = tenants.reduce((total, tenant) => total + tenant.schools.length, 0);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Tenants & schools</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Onboard and maintain platform tenant, school and education-network configuration. School operational roles and circuit inspector contacts remain separate governed workflows.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Active tenants</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{tenants.filter((tenant) => tenant.status === "active").length}</p></div>
            <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><Building2 aria-hidden="true" className="size-4" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Registered schools</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{schoolCount}</p></div>
            <span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><School aria-hidden="true" className="size-4" /></span>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] xl:items-start">
          <section className="min-w-0">
            <div className="mb-4">
              <h2 className="scolapro-section-title">Tenant configuration</h2>
              <p className="scolapro-section-description">Mutable metadata is editable here; tenant slugs and record identities remain fixed. Region/circuit changes preserve effective-dated history.</p>
            </div>
            <PlatformTenantConfiguration
              tenants={tenants}
              regions={networkOptions.regions}
              circuits={networkOptions.circuits}
              today={todayInNamibia()}
            />
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
            <h2 className="scolapro-section-title">Onboard tenant</h2>
            <p className="scolapro-section-description">Start with the organization boundary and its first school. School administrators are invited through the separate governed access workflow.</p>
            <div className="mt-5"><TenantOnboardingForm /></div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
