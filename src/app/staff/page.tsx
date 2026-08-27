import { BadgeCheck, UserRoundCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSchoolStaffDirectory } from "@/features/staff/server/directory";
import { getUserContext } from "@/lib/auth/get-user-context";

function humanRole(value: string) {
  return value.replaceAll("_", " ");
}

export default async function StaffPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/staff");

  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const rows = await getSchoolStaffDirectory(membership.schoolId);
  const activeCount = rows.filter((row) => !row.activeTo || new Date(row.activeTo) >= new Date()).length;

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em]">Staff directory</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Current school-scoped users and their governed role assignments for {membership.schoolName}.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Role assignments</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{rows.length}</p></div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong"><UsersRound className="size-4" aria-hidden="true" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div><p className="text-xs font-medium text-muted-foreground">Active assignments</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{activeCount}</p></div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-success-soft text-[color:var(--success)]"><UserRoundCheck className="size-4" aria-hidden="true" /></span>
          </div>
        </div>

        <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">School users</h2>
            <p className="mt-1 text-xs text-muted-foreground">A person may hold more than one governed role when required by the school.</p>
          </div>

          {rows.length ? (
            <div className="divide-y divide-border-subtle">
              {rows.map((row) => (
                <article key={row.membershipId} className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.45fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.employeeNumber ? `Employee ${row.employeeNumber}` : "Employee number not set"}</p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs font-medium capitalize">
                      <BadgeCheck className="size-3.5 text-brand-strong" aria-hidden="true" />
                      {humanRole(row.roleKey)}
                    </span>
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground">From {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(row.activeFrom))}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center">
              <p className="text-sm font-medium">No school staff linked yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Use Invitations to onboard the first school administrator or staff member.</p>
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
