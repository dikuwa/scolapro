import { Clock3, MailPlus, School, UsersRound, X } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SchoolInvitationForm } from "@/features/platform/school-invitation-form";
import { revokeSchoolInvitation } from "@/features/platform/server/actions";
import { getSchoolInvitationAdminData } from "@/features/platform/server/invitations";
import { getUserContext } from "@/lib/auth/get-user-context";

function humanRole(roleKey: string) { return roleKey.replaceAll("_", " "); }
function statusClass(status: string) {
  if (status === "accepted") return "bg-success-soft text-[color:var(--success)]";
  if (status === "revoked" || status === "expired") return "bg-surface-muted text-muted-foreground";
  return "bg-[color:var(--accent-amber-soft)] text-[color:var(--accent-amber)]";
}

export default async function SchoolInvitationsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/invitations");

  const membership = context.memberships.find((item) => item.roleKey === "school_admin");
  if (!membership) redirect("/");

  const { schoolOptions, invitations } = await getSchoolInvitationAdminData();
  const pendingCount = invitations.filter((item) => item.status === "pending").length;
  const schoolName = schoolOptions.find((school) => school.id === membership.schoolId)?.name
    ?? membership.schoolName;

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Invite school staff</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Invite teachers and staff who will work within this school. Roles, school scope and the secure join token remain governed by the school&apos;s own administration.</p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Pending invitations</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-amber)]">{pendingCount}</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">School</p><p className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-foreground">{schoolName}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><School className="size-4" aria-hidden="true" /></span></div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:items-start">
          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-4"><span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><MailPlus className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Invitation history</h2><p className="scolapro-section-description !mt-0">Invitations issued for {schoolName} only.</p></div></div>
            {invitations.length ? <div className="divide-y divide-border-subtle">{invitations.map((invitation) => <article key={invitation.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="scolapro-record-title truncate">{invitation.email}</p><p className="mt-0.5 text-xs text-muted-foreground">{invitation.schoolName} · <span className="capitalize">{humanRole(invitation.roleKey)}</span></p></div><div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className={`rounded-[var(--radius-xs)] px-2 py-1 capitalize ${statusClass(invitation.status)}`}>{invitation.status}</span><span>{new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(invitation.expiresAt))}</span>{invitation.status === "pending" ? <form action={revokeSchoolInvitation}><input type="hidden" name="invitationId" value={invitation.id} /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-[color:var(--danger)] transition hover:bg-danger-soft" title="Revoke invitation"><X className="size-3.5" aria-hidden="true" /> Revoke</button></form> : null}</div></article>)}</div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No invitations yet</p><p className="mt-1 text-xs text-muted-foreground">Invite the first staff members into {schoolName}.</p></div>}
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
            <h2 className="scolapro-section-title">Invite staff to {schoolName}</h2>
            <p className="scolapro-section-description">The invitation expires after seven days and can only be accepted by an authenticated account with the same email address.</p>
            <div className="mt-5"><SchoolInvitationForm schools={schoolOptions} /></div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}