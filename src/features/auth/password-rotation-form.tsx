"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changePassword } from "@/features/profile/server/actions";
import { signOut } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

export function PasswordRotationForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <>
      {state.success ? (
        <p role="status" className="mt-4 text-sm text-[color:var(--success)]">
          Password updated. <Link className="underline" href="/">Continue to your workspace</Link>.
        </p>
      ) : (
        <form action={action} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            New password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required
              className="mt-1 block w-full rounded-[var(--radius-sm)] border border-border-subtle bg-background p-3" />
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
            <input name="confirmation" type="password" autoComplete="new-password" minLength={8} required
              className="mt-1 block w-full rounded-[var(--radius-sm)] border border-border-subtle bg-background p-3" />
          </label>
          {state.message ? <p role="alert" className="text-sm text-muted-foreground">{state.message}</p> : null}
          <Button type="submit" disabled={pending}>Update password</Button>
        </form>
      )}
      <form action={signOut} className="mt-4">
        <Button variant="ghost" type="submit">Sign out</Button>
      </form>
    </>
  );
}
