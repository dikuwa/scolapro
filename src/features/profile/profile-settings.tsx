"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { changePassword, deleteAvatar, type ProfileActionState } from "@/features/profile/server/actions";
import { Spinner } from "@/components/ui/spinner";

const initialState: ProfileActionState = {};
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 3 * 1024 * 1024;

type AvatarUploadResponse = {
  message?: string;
  avatarUrl?: string;
};

export function ProfileSettings({ avatarUrl, userId, mustChangePassword }: { avatarUrl: string | null; userId: string; mustChangePassword: boolean }) {
  const router = useRouter();
  const [passwordState, passwordAction, passwordPending] = useActionState(changePassword, initialState);
  const [deletePending, startDelete] = useTransition();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl);
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!passwordState.message) return;
    if (passwordState.success) toast.success(passwordState.message);
    else toast.error(passwordState.message);
  }, [passwordState]);

  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function choosePreview(file?: File) {
    if (!file) return;
    if (!allowedAvatarTypes.has(file.type)) {
      toast.error("Choose a JPG, PNG or WebP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > maxAvatarBytes) {
      toast.error("Avatar images must be 3 MB or smaller.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFileName(file.name);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return objectUrl;
    });
  }

  async function uploadSelectedAvatar() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose an image first.");
      return;
    }
    if (!allowedAvatarTypes.has(file.type)) {
      toast.error("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > maxAvatarBytes) {
      toast.error("Avatar images must be 3 MB or smaller.");
      return;
    }

    setAvatarUploading(true);
    try {
      const body = new FormData();
      body.set("avatar", file);
      const response = await fetch("/api/profile/avatar", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as AvatarUploadResponse;

      if (!response.ok || !result.avatarUrl) {
        toast.error(result.message ?? "The avatar could not be uploaded. Please try again.");
        return;
      }

      setPreviewUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return result.avatarUrl ?? current;
      });
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success(result.message ?? "Profile photo updated.");
      router.refresh();
    } catch {
      toast.error("The avatar upload could not reach the server. Check your connection and try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2"><Camera className="size-4 text-brand-strong" aria-hidden="true" /><h2 className="scolapro-section-title">Profile photo</h2></div>
        <p className="scolapro-section-description">JPG, PNG or WebP. Maximum 3 MB. A local preview appears immediately before upload.</p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="size-20 shrink-0 overflow-hidden rounded-full bg-surface-muted">
            {previewUrl ? <img src={previewUrl} alt="Current profile" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-xs font-medium text-muted-foreground">No photo</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileInputRef} id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => choosePreview(event.target.files?.[0])} />
              <button type="button" disabled={avatarUploading} onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium text-foreground transition hover:bg-surface-subtle disabled:opacity-60"><ImagePlus className="size-3.5" aria-hidden="true" /> Choose photo</button>
              <span className="max-w-48 truncate text-xs text-muted-foreground">{fileName || (avatarUrl ? "Current photo" : "No photo selected")}</span>
              <button type="button" onClick={uploadSelectedAvatar} disabled={avatarUploading || !fileName} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50">{avatarUploading ? <Spinner className="size-3.5 text-white" /> : <Camera className="size-3.5" />} {avatarUploading ? "Uploading…" : "Update"}</button>
            </div>
            {avatarUrl ? <button type="button" disabled={deletePending || avatarUploading} onClick={() => startDelete(async () => { const result = await deleteAvatar(); if (result.success) { setPreviewUrl(null); setFileName(""); if (fileInputRef.current) fileInputRef.current.value = ""; router.refresh(); toast.success(result.message); } else toast.error(result.message); })} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[color:var(--danger)] hover:bg-danger-soft disabled:opacity-60">{deletePending ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />} Remove photo</button> : null}
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2"><KeyRound className="size-4 text-brand-strong" aria-hidden="true" /><h2 className="scolapro-section-title">Password</h2></div>
        <p className="scolapro-section-description">{mustChangePassword ? "Choose a new password to complete your first sign-in." : "Change your password whenever needed."}</p>
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
