import { BadgeCheck, UserRoundCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { StaffConfigurationList } from "@/features/staff/staff-configuration-list";
import { getSchoolStaffDirectory } from "@/features/staff/server/directory";
import { listSchoolRooms } from "@/features/timetable/server/rooms";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function StaffPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/staff");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const [rows, rooms] = await Promise.all([getSchoolStaffDirectory(membership.schoolId), listSchoolRooms(membership.schoolId)]);
  const canManage = membership.roleKey === "school_admin";
  const today = new Date().toISOString().slice(0, 10);
  const activeCount = rows.filter((row) => row.activeFrom <= today && (!row.activeTo || row.activeTo >= today)).length;
  const accountCount = rows.filter((row) => row.hasAccount).length;

  return (
    <AppShell>
      <section>
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Staff directory</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">School staff placements are independent of login accounts, so imported staff can be timetabled before they accept an invitation.</p></div>
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Staff people</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{rows.length}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Active placements</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{activeCount}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><UserRoundCheck className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Login accounts</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-sky)]">{accountCount}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><BadgeCheck className="size-4" aria-hidden="true" /></span></div>
        </div>
        <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="mb-4 border-b border-border-subtle pb-4"><h2 className="scolapro-section-title">School staff</h2><p className="scolapro-section-description">Placement describes who works at the school; account roles describe what an invited user may do in ScolaPro.</p></div>
          <StaffConfigurationList rows={rows} rooms={rooms} canManage={canManage} />
        </section>
      </section>
    </AppShell>
  );
}
