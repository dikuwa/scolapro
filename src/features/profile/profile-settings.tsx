"use client";

import { useActionState, useEffect, useTransition } from "react";
import { Camera, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { changePassword, deleteAvatar, uploadAvatar, type ProfileActionState } from "@/features/profile/server/actions";
import { Spinner } from "@/components/ui/spinner";

const initialState: ProfileActionState = {};

export function ProfileSettings({ avatarUrl, mustChangePassword }: { avatarUrl: string | null; mustChangePassword: boolean }) {
  const [avatarState, avatarAction, avatarPending] = useActionState(uploadAvatar, initialState);
  const [passwordState, passwordAction, passwordPending] = useActionState(changePassword, initialState);
  const [deletePending, startDelete] = useTransition();

  useEffect(() => {
    if (avatarState.message) avatarState.success ? toast.success(avatarState.message) : toast.error(avatarState.message);
  }, [avatarState]);
  useEffect(() => {
    if (passwordState.message) passwordState.success ? toast.success(passwordState.message) : toast.error(passwordState.message);
  }, [passwordState]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2"><Camera className="size-4 text-brand-strong" aria-hidden="true" /><h2 className="text-sm font-semibold">Profile photo</h2></div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">JPG, PNG or WebP. Maximum 3 MB.</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="size-20 overflow-hidden rounded-full bg-surface-muted">
            {avatarUrl ? <img src={avatarUrl} alt="Current profile" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-xs font-medium text-muted-foreground">No photo</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={avatarAction} className="flex items-center gap-2">
              <input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="max-w-56 text-xs text-muted-foreground file:mr-2 file:rounded-[var(--radius-xs)] file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground" />
              <button type="submit" disabled={avatarPending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{avatarPending ? <Spinner className="size-3.5 text-white" /> : <Camera className="size-3.5" />} Update</button>
            </form>
            {avatarUrl ? <button type="button" disabled={deletePending} onClick={() => startDelete(async () => { const result = await deleteAvatar(); result.success ? toast.success(result.message) : toast.error(result.message); })} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[color:var(--danger)] hover:bg-danger-soft disabled:opacity-60">{deletePending ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />} Remove</button> : null}
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2"><KeyRound className="size-4 text-brand-strong" aria-hidden="true" /><h2 className="text-sm font-semibold">Password</h2></div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{mustChangePassword ? "Choose a new password to complete your first sign-in." : "Change your password whenever needed."}</p>
        {mustChangePassword ? <div className="mt-3 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-xs text-[color:var(--warning)]">Password change required before continuing regular account use.</div> : null}
        <form action={passwordAction} className="mt-4 space-y-3">
          <div><label htmlFor="password" className="text-xs font-medium">New password</label><input id="password" name="password" type="password" autoComplete="new-password" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></div>
          <div><label htmlFor="confirmation" className="text-xs font-medium">Confirm password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></div>
          <button type="submit" disabled={passwordPending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{passwordPending ? <Spinner className="size-3.5 text-white" /> : <KeyRound className="size-3.5" />} {passwordPending ? "Changing…" : "Change password"}</button>
        </form>
      </section>
    </div>
  );
}
