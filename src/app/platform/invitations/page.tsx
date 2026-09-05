import { Building2, Clock3, MailPlus, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SchoolInvitationForm } from "@/features/platform/school-invitation-form";
import { revokePlatformSchoolInvitation } from "@/features/platform/server/actions";
import { getPlatformInvitationAdminData } from "@/features/platform/server/invitations";
import { getUserContext } from "@/lib/auth/get-user-context";

function humanRole(roleKey: string) { return roleKey.replaceAll("_", " "); }
function statusClass(status: string) {
  if (status === "accepted") return "bg-success-soft text-[color:var(--success)]";
  if (status === "revoked" || status === "expired") return "bg-surface-muted text-muted-foreground";
  return "bg-[color:var(--accent-amber-soft)] text-[color:var(--accent-amber)]";
}

export default async function PlatformInvitationsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/platform/invitations");
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  if (!isPlatformAdmin) redirect("/");

  const { schoolOptions, invitations } = await getPlatformInvitationAdminData();
  const pendingCount = invitations.filter((item) => item.status === "pending").length;

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">School onboarding</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Establish initial school administration across ScolaPro. Routine teacher and staff invitations belong to each school&apos;s own administrators.</p>
        </div>
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Pending invitations</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-amber)]">{pendingCount}</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><Clock3 className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Onboarded schools</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{schoolOptions.length}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span></div>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:items-start">
          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-4"><span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><MailPlus className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Platform invitation history</h2><p className="scolapro-section-description !mt-0">Recent governed school-administrator onboarding invitations.</p></div></div>
            {invitations.length ? <div className="divide-y divide-border-subtle">{invitations.map((invitation) => <article key={invitation.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="scolapro-record-title truncate">{invitation.email}</p><p className="mt-0.5 text-xs text-muted-foreground">{invitation.schoolName} · {invitation.tenantName} · <span className="capitalize">{humanRole(invitation.roleKey)}</span></p></div><div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className={`rounded-[var(--radius-xs)] px-2 py-1 capitalize ${statusClass(invitation.status)}`}>{invitation.status}</span><span>{new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(invitation.expiresAt))}</span>{invitation.status === "pending" ? <form action={revokePlatformSchoolInvitation}><input type="hidden" name="invitationId" value={invitation.id} /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-[color:var(--danger)] transition hover:bg-danger-soft" title="Revoke invitation"><X className="size-3.5" aria-hidden="true" /> Revoke</button></form> : null}</div></article>)}</div> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No platform invitations yet</p><p className="mt-1 text-xs text-muted-foreground">Establish the first School Administrator through the onboarding flow.</p></div>}
          </section>
          <div className="space-y-5">
            <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
              <h2 className="scolapro-section-title">Establish school administration</h2>
              <p className="scolapro-section-description">Platform onboarding may establish a School Administrator. Once that school is operating, its administrators invite teachers, support staff and other school roles.</p>
              <div className="mt-5"><SchoolInvitationForm schools={schoolOptions} mode="platform" /></div>
            </section>
            <Link href="/platform/tenants" className="scolapro-cta group inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-surface px-4 text-sm font-medium shadow-[var(--shadow-xs)] transition hover:bg-surface-muted"><Building2 className="size-4" aria-hidden="true" /> Manage tenants &amp; schools</Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
