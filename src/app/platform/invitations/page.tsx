import { Clock3, MailPlus, UsersRound, X } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SchoolInvitationForm } from "@/features/platform/school-invitation-form";
import { revokeSchoolInvitation } from "@/features/platform/server/actions";
import { getInvitationAdminData } from "@/features/platform/server/invitations";
import { getUserContext } from "@/lib/auth/get-user-context";

function humanRole(roleKey: string) {
  return roleKey.replaceAll("_", " ");
}

export default async function PlatformInvitationsPage() {
  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  const isSchoolAdmin = context.memberships.some((membership) => membership.roleKey === "school_admin");

  if (!context.user) redirect("/login?next=/platform/invitations");
  if (!isPlatformAdmin && !isSchoolAdmin) redirect("/");

  const { schoolOptions, invitations } = await getInvitationAdminData();
  const pendingCount = invitations.filter((item) => item.status === "pending").length;

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em]">User invitations</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Invite school users into an explicit school and role scope. The secure join token is shown only when the invitation is created.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Pending invitations</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{pendingCount}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong"><Clock3 className="size-4" aria-hidden="true" /></span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Available schools</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{schoolOptions.length}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-brand-strong"><UsersRound className="size-4" aria-hidden="true" /></span>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
          <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <MailPlus className="size-4 text-brand-strong" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold">Invitation history</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Recent governed invitations visible within your authorized scope.</p>
              </div>
            </div>

            {invitations.length ? (
              <div className="divide-y divide-border-subtle">
                {invitations.map((invitation) => (
                  <article key={invitation.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{invitation.email}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {invitation.schoolName} · {invitation.tenantName} · <span className="capitalize">{humanRole(invitation.roleKey)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 capitalize">{invitation.status}</span>
                      <span>{new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(invitation.expiresAt))}</span>
                      {invitation.status === "pending" ? (
                        <form action={revokeSchoolInvitation}>
                          <input type="hidden" name="invitationId" value={invitation.id} />
                          <button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-[color:var(--danger)] transition hover:bg-danger-soft" title="Revoke invitation">
                            <X className="size-3.5" aria-hidden="true" /> Revoke
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center">
                <p className="text-sm font-medium">No invitations yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Create the first governed school invitation.</p>
              </div>
            )}
          </section>

          <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Invite school user</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The invitation expires after seven days and can only be accepted by an authenticated account with the same email address.
            </p>
            <div className="mt-5"><SchoolInvitationForm schools={schoolOptions} /></div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
