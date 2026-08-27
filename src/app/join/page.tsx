import { GraduationCap, ShieldCheck } from "lucide-react";
import { InvitationJoinForm } from "@/features/auth/invitation-join-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  if (!token) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <section className="public-shell mx-auto flex min-h-[70vh] items-center justify-center">
          <div className="max-w-md rounded-[var(--radius-md)] bg-surface p-6 text-center shadow-[var(--shadow-xs)]">
            <h1 className="text-xl font-semibold">Invitation link required</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Open the secure ScolaPro invitation link provided by your school administrator.</p>
          </div>
        </section>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: previewRows, error: previewError }, { data: authData }] = await Promise.all([
    supabase.rpc("get_school_invitation_preview", { p_token: token }),
    supabase.auth.getUser(),
  ]);
  const preview = Array.isArray(previewRows) ? previewRows[0] : previewRows;

  if (previewError || !preview) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <section className="public-shell mx-auto flex min-h-[70vh] items-center justify-center">
          <div className="max-w-md rounded-[var(--radius-md)] bg-surface p-6 text-center shadow-[var(--shadow-xs)]">
            <h1 className="text-xl font-semibold">Invitation unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This invitation is invalid, expired, or has already been used. Ask the school administrator for a new invitation.</p>
          </div>
        </section>
      </main>
    );
  }

  const roleLabel = String(preview.role_key).replaceAll("_", " ");

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="public-shell mx-auto grid min-h-[calc(100vh-3rem)] overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)] lg:grid-cols-[minmax(0,0.95fr)_minmax(24rem,0.7fr)]">
        <section className="flex flex-col justify-between bg-surface-muted p-6 sm:p-8 lg:p-10">
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-brand text-white shadow-[var(--shadow-xs)]"><GraduationCap className="size-5" aria-hidden="true" /></span>
            ScolaPro
          </div>

          <div className="my-12 max-w-xl lg:my-auto">
            <p className="text-sm font-medium text-brand-strong">{preview.tenant_name}</p>
            <h1 className="mt-2 text-[clamp(1.7rem,1.4rem+1vw,2.6rem)] font-semibold leading-[1.12] tracking-[-0.04em]">Join {preview.school_name}</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">Your invitation grants the <span className="font-medium capitalize text-foreground">{roleLabel}</span> role within this school. Access remains governed by school scope and database policies.</p>

            <div className="mt-7 flex max-w-lg items-start gap-3 rounded-[var(--radius-sm)] bg-surface px-4 py-3.5 shadow-[var(--shadow-xs)]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[color:var(--success)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Invitation protected by email and token</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Only the invited email can accept this role, and the token expires automatically.</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">ScolaPro · Namibia-first education operations</p>
        </section>

        <section className="flex items-center p-6 sm:p-8 lg:p-10">
          <div className="mx-auto w-full max-w-md">
            <h2 className="text-xl font-semibold tracking-[-0.03em]">Complete your access</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Invited email: <span className="font-medium text-foreground">{preview.email}</span></p>
            <InvitationJoinForm token={token} email={String(preview.email)} signedIn={Boolean(authData.user)} />
          </div>
        </section>
      </div>
    </main>
  );
}
