"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { acceptInvitation, signUpForInvitation, type InvitationJoinState } from "@/features/auth/invitation-actions";

const initialState: InvitationJoinState = {};

const fieldClass = "min-h-11 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function InvitationJoinForm({
  token,
  email,
  signedIn,
}: {
  token: string;
  email: string;
  signedIn: boolean;
}) {
  const [signupState, signupAction, signupPending] = useActionState(signUpForInvitation, initialState);
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptInvitation, initialState);

  if (signedIn) {
    return (
      <form action={acceptAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        {acceptState.message ? (
          <div className="rounded-[var(--radius-sm)] bg-danger-soft px-3.5 py-3 text-sm text-[color:var(--danger)]">{acceptState.message}</div>
        ) : null}
        <button type="submit" disabled={acceptPending} className="scolapro-cta inline-flex min-h-11 w-full items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
          {acceptPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
          {acceptPending ? "Joining school…" : "Accept invitation"}
          {!acceptPending ? <ArrowRight className="scolapro-cta-icon size-4" aria-hidden="true" /> : null}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-6">
      <form action={signupAction} className="space-y-4" noValidate>
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="join-email" className="text-sm font-medium">Email</label>
          <input id="join-email" name="email" type="email" value={email} readOnly className={`${fieldClass} mt-1.5 bg-surface-muted`} />
        </div>
        <div>
          <label htmlFor="join-password" className="text-sm font-medium">Create password</label>
          <input id="join-password" name="password" type="password" autoComplete="new-password" className={`${fieldClass} mt-1.5`} placeholder="At least 8 characters" />
          {signupState.fieldErrors?.password?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{signupState.fieldErrors.password[0]}</p> : null}
        </div>

        {signupState.message ? (
          <div className={`rounded-[var(--radius-sm)] px-3.5 py-3 text-sm leading-5 ${signupState.success ? "bg-success-soft text-[color:var(--success)]" : "bg-danger-soft text-[color:var(--danger)]"}`}>
            {signupState.message}
          </div>
        ) : null}

        <button type="submit" disabled={signupPending} className="scolapro-cta inline-flex min-h-11 w-full items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
          {signupPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {signupPending ? "Creating account…" : "Create account and join"}
          {!signupPending ? <ArrowRight className="scolapro-cta-icon size-4" aria-hidden="true" /> : null}
        </button>
      </form>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Already have a ScolaPro account?{" "}
        <Link href={`/login?next=${encodeURIComponent(`/join?token=${token}`)}`} className="font-medium text-brand-strong hover:underline">Sign in with {email}</Link>.
      </p>
    </div>
  );
}
