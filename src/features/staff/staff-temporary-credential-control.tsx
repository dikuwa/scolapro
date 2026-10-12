"use client";

import { useState, useTransition } from "react";
import { KeyRound, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { issueStaffTemporaryCredentialAction } from "@/features/staff/server/temporary-credential-actions";

// Never persist or log the plaintext password. Closing the one-time reveal
// removes it from component state; the ledger deliberately has no readback.
export function StaffTemporaryCredentialControl({
  schoolId,
  staffMemberId,
}: {
  schoolId: string;
  staffMemberId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [credential, setCredential] = useState<{ password: string; expiresAt: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dismiss = () => {
    setCredential(null);
    setConfirming(false);
  };

  const issue = () => {
    if (pending) return;
    const formData = new FormData();
    formData.set("schoolId", schoolId);
    formData.set("staffMemberId", staffMemberId);
    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await issueStaffTemporaryCredentialAction(formData);
        if (!result.success || !result.temporaryPassword || !result.expiresAt) {
          toast.error(result.message ?? "Credential issuance failed.");
          return;
        }
        setCredential({ password: result.temporaryPassword, expiresAt: result.expiresAt });
      } catch {
        toast.error("Credential issuance failed.");
      }
    });
  };

  return (
    <div className="mt-3 rounded-[var(--radius-sm)] border border-border-subtle p-3">
      <p className="text-xs font-semibold text-foreground">Temporary staff login</p>
      <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">
        For an eligible linked account only. Issuing this credential replaces its current password,
        expires in one hour, and requires a password change at first sign-in. The school must hand
        it to the intended staff member through a private channel. The standard email invitation
        and password-reset options remain available.
      </p>
      {credential ? (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <p className="text-xs font-semibold">Copy now — this password cannot be recovered.</p>
          <code className="block break-all rounded bg-surface-muted p-2 text-sm select-all">{credential.password}</code>
          <p className="text-[0.68rem] text-muted-foreground">
            Expires: {new Date(credential.expiresAt).toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="neutral" onClick={() => {
              void navigator.clipboard.writeText(credential.password).then(
                () => toast.success("Copied. Clear your clipboard after delivery."),
                () => toast.error("Copy failed. Select the credential manually."),
              );
            }}>
              <Copy className="size-3.5" aria-hidden="true" /> Copy credential
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
              <X className="size-3.5" aria-hidden="true" /> Dismiss credential
            </Button>
          </div>
        </div>
      ) : confirming ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-foreground">
            Confirm replacing the linked account password. Any existing password will stop working immediately.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="neutral" loading={pending} onClick={issue}>
              Confirm issuance
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="ghost" className="mt-2" disabled={pending}
          onClick={() => setConfirming(true)}>
          <KeyRound className="size-3.5" aria-hidden="true" /> Issue temporary credential
        </Button>
      )}
    </div>
  );
}
