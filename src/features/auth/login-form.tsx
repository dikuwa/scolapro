"use client";

import { useActionState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { signIn, type LoginState } from "@/features/auth/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <div className="relative mt-1.5">
          <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(state.fieldErrors?.email?.length)}
            aria-describedby={state.fieldErrors?.email?.length ? "email-error" : undefined}
            className="min-h-11 w-full rounded-xl border border-border bg-surface-elevated pl-10 pr-3 text-sm text-foreground shadow-[var(--shadow-sm)] outline-none transition duration-200 placeholder:text-muted-foreground/70 hover:border-[color:var(--brand)]/30 focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:var(--brand-soft)]"
            placeholder="you@school.edu.na"
          />
        </div>
        {state.fieldErrors?.email?.[0] ? (
          <p id="email-error" className="mt-1.5 text-xs text-[color:var(--danger)]">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <div className="relative mt-1.5">
          <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(state.fieldErrors?.password?.length)}
            aria-describedby={state.fieldErrors?.password?.length ? "password-error" : undefined}
            className="min-h-11 w-full rounded-xl border border-border bg-surface-elevated pl-10 pr-3 text-sm text-foreground shadow-[var(--shadow-sm)] outline-none transition duration-200 placeholder:text-muted-foreground/70 hover:border-[color:var(--brand)]/30 focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:var(--brand-soft)]"
            placeholder="Enter your password"
          />
        </div>
        {state.fieldErrors?.password?.[0] ? (
          <p id="password-error" className="mt-1.5 text-xs text-[color:var(--danger)]">
            {state.fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      {state.message ? (
        <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm leading-5 text-[color:var(--danger)]">
          {state.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition duration-200 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-65"
      >
        {pending ? "Signing in…" : "Sign in"}
        {!pending ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
      </button>
    </form>
  );
}
