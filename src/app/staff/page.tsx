import { BadgeCheck, UserRoundCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SingleStaffForm } from "@/features/staff/single-staff-form";
import { getSchoolStaffDirectory } from "@/features/staff/server/directory";
import { getUserContext } from "@/lib/auth/get-user-context";

function humanRole(value: string) { return value.replaceAll("_", " "); }

export default async function StaffPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/staff");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const rows = await getSchoolStaffDirectory(membership.schoolId);
  const today = new Date().toISOString().slice(0, 10);
  const activeCount = rows.filter((row) => row.activeFrom <= today && (!row.activeTo || row.activeTo >= today)).length;
  const accountCount = rows.filter((row) => row.hasAccount).length;
  const canAddStaff = membership.roleKey === "school_admin";

  return (
    <AppShell>
      <section>
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Staff directory</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">School staff placements are independent of login accounts, so staff can be timetabled before they ever need a ScolaPro invitation.</p></div>
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Staff people</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{rows.length}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Active placements</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{activeCount}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><UserRoundCheck className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Login accounts</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-sky)]">{accountCount}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><BadgeCheck className="size-4" aria-hidden="true" /></span></div>
        </div>

        {canAddStaff ? <div className="mt-5"><SingleStaffForm schoolId={membership.schoolId} today={today} /></div> : null}

        <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="mb-4 border-b border-border-subtle pb-4"><h2 className="scolapro-section-title">School staff</h2><p className="scolapro-section-description">Placement describes who works at the school; account roles describe what an invited user may do in ScolaPro.</p></div>
          {rows.length ? <div className="divide-y divide-border-subtle">{rows.map((row) => <article key={row.id} className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.7fr)_auto] sm:items-center"><div className="min-w-0"><p className="scolapro-record-title truncate">{row.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.employeeNumber ? `Employee ${row.employeeNumber}` : "Employee number not set"} · {row.hasAccount ? "Account linked" : "No login account yet"}</p></div><div className="flex flex-wrap gap-1.5">{row.labels.map((label)=><span key={label} className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-[color:var(--accent-indigo-soft)] px-2.5 py-1.5 text-xs font-medium capitalize text-[color:var(--accent-indigo)]"><BadgeCheck className="size-3.5" aria-hidden="true" />{humanRole(label)}</span>)}</div><p className="text-xs tabular-nums text-muted-foreground">From {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(row.activeFrom))}</p></article>)}</div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No school staff linked yet</p><p className="mt-1 text-xs text-muted-foreground">{canAddStaff ? "Add one staff member above or use bulk import for a larger roster." : "The School Admin can add or import staff members."}</p></div>}
        </section>
      </section>
    </AppShell>
  );
}
