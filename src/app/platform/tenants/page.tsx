import { Building2, School } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { TenantOnboardingForm } from "@/features/platform/tenant-onboarding-form";
import { getPlatformTenants } from "@/features/platform/server/tenants";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function PlatformTenantsPage() {
  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");

  if (!context.user) redirect("/login?next=/platform/tenants");
  if (!isPlatformAdmin) redirect("/");

  const tenants = await getPlatformTenants();
  const schoolCount = tenants.reduce((total, tenant) => total + tenant.schools.length, 0);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em] text-foreground">
            Tenants & schools
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Create and review ScolaPro tenant boundaries. User identities and role assignments remain separate from tenant records.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Active tenants</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{tenants.filter((tenant) => tenant.status === "active").length}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong">
              <Building2 aria-hidden="true" className="size-4" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Registered schools</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{schoolCount}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong">
              <School aria-hidden="true" className="size-4" />
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
          <section className="min-w-0 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Tenant directory</h2>
                <p className="mt-1 text-xs text-muted-foreground">RLS-backed platform view of current tenant and school records.</p>
              </div>
            </div>

            {tenants.length ? (
              <div className="divide-y divide-border-subtle">
                {tenants.map((tenant) => (
                  <article key={tenant.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{tenant.name}</h3>
                          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-medium capitalize text-muted-foreground">
                            {tenant.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{tenant.slug}</p>
                      </div>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {tenant.schools.length} {tenant.schools.length === 1 ? "school" : "schools"}
                      </p>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {tenant.schools.map((school) => (
                        <div key={school.id} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs font-medium text-foreground">{school.name}</p>
                            <p className="text-[0.68rem] text-muted-foreground">
                              {[school.town, school.region].filter(Boolean).join(" · ") || "Location not set"}
                            </p>
                          </div>
                          <p className="mt-1 text-[0.68rem] text-muted-foreground">
                            {school.emisNumber ? `EMIS ${school.emisNumber}` : "EMIS number not set"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center">
                <p className="text-sm font-medium">No tenants yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Use the onboarding form to create the first tenant and school.</p>
              </div>
            )}
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Onboard tenant</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Start with the organization boundary and its first school. Additional schools and administrators are added in later governed steps.
            </p>
            <div className="mt-5">
              <TenantOnboardingForm />
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}