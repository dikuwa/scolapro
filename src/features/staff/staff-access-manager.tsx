"use client";

import { useActionState, useEffect, useState } from "react";
import { Link2, Plus, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import {
  addStaffRole,
  endStaffRole,
  inviteExistingStaff,
  resendExistingStaffInvitation,
  sendStaffPasswordReset,
  sendStaffVerification,
  type StaffAccessState,
} from "@/features/staff/server/access-actions";
import type { StaffDirectoryRow } from "@/features/staff/server/directory";

const initialState: StaffAccessState = {};
const roleOptions = [
  ["school_admin", "School administrator"], ["principal", "Principal"],
  ["deputy_principal", "Deputy principal"], ["hod", "Head of department"],
  ["teacher", "Teacher"], ["class_teacher", "Class teacher"],
  ["counsellor", "Counsellor"], ["social_worker", "Social worker"],
  ["librarian", "Librarian"], ["board_member", "School board member"],
] as const;

function roleLabel(value: string) {
  return roleOptions.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
}

export function StaffAccessManager({ schoolId, row }: { schoolId: string; row: StaffDirectoryRow }) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteExistingStaff, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendExistingStaffInvitation, initialState);
  const [roleState, roleAction, rolePending] = useActionState(addStaffRole, initialState);
  const [verificationState, verificationAction] = useActionState(sendStaffVerification, initialState);
  const [resetState, resetAction] = useActionState(sendStaffPasswordReset, initialState);
  const [roleKey, setRoleKey] = useState<string>("teacher");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (inviteState.message) (inviteState.success ? toast.success : toast.error)(inviteState.message);
  }, [inviteState]);
  useEffect(() => {
    if (resendState.message) (resendState.success ? toast.success : toast.error)(resendState.message);
  }, [resendState]);
  useEffect(() => {
    if (roleState.message) (roleState.success ? toast.success : toast.error)(roleState.message);
  }, [roleState]);
  useEffect(() => {
    if (verificationState.message) (verificationState.success ? toast.success : toast.error)(verificationState.message);
  }, [verificationState]);
  useEffect(() => {
    if (resetState.message) (resetState.success ? toast.success : toast.error)(resetState.message);
  }, [resetState]);
  async function endRoleAction(formData: FormData) {
    const result = await endStaffRole(formData);
    if (result.message) (result.success ? toast.success : toast.error)(result.message);
  }

  if (!row.staffId) return <span className="text-xs text-muted-foreground">Membership-only account</span>;
  if (row.hasAccount) {
    return (
      <div className="w-full space-y-2 sm:max-w-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.68rem] font-medium text-[color:var(--success)]">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Account linked
          </span>
          {row.activeRoles.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.68rem] font-medium text-brand-strong">
              {roleLabel(item.roleKey)}
              <form action={endRoleAction}>
                <input type="hidden" name="schoolId" value={schoolId} />
                <input type="hidden" name="membershipId" value={item.id} />
                <button type="submit" aria-label={`End ${roleLabel(item.roleKey)} role`} className="text-brand-strong hover:text-danger"><X className="size-3" /></button>
              </form>
            </span>
          ))}
        </div>
        <form action={roleAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="staffMemberId" value={row.staffId} />
          <input type="hidden" name="roleKey" value={roleKey} />
          <Picker ariaLabel="Add school role" value={roleKey} onChange={setRoleKey} options={roleOptions.map(([value, label]) => ({ value, label }))} placeholder="Choose role" className="min-w-44" />
          <button type="submit" disabled={rolePending} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium text-foreground disabled:opacity-50">
            <Plus className="size-3.5" /> {rolePending ? "Adding…" : "Add role"}
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={verificationAction}>
            <input type="hidden" name="schoolId" value={schoolId} />
            <input type="hidden" name="staffMemberId" value={row.staffId} />
            <button type="submit" className="text-[0.68rem] font-medium text-muted-foreground underline-offset-2 hover:underline">Send verification email</button>
          </form>
          <form action={resetAction}>
            <input type="hidden" name="schoolId" value={schoolId} />
            <input type="hidden" name="staffMemberId" value={row.staffId} />
            <button type="submit" className="text-[0.68rem] font-medium text-muted-foreground underline-offset-2 hover:underline">Send password-reset email</button>
          </form>
        </div>
        <p className="text-[0.68rem] text-muted-foreground">Role changes do not change the staff placement or password.</p>
      </div>
    );
  }

  if (row.pendingInvitationId) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 font-medium text-[color:var(--warning)]"><UserPlus className="size-3.5" /> Invitation pending</span>
        <form action={resendAction}>
          <input type="hidden" name="invitationId" value={row.pendingInvitationId} />
          <button type="submit" disabled={resendPending} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2 text-[0.68rem] font-medium disabled:opacity-50">{resendPending ? "Resending…" : "Resend invitation"}</button>
        </form>
        {resendState.invitationToken ? <span className="basis-full break-all rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.68rem] text-[color:var(--success)]">New join link: <span className="font-mono">{`/join?token=${resendState.invitationToken}`}</span></span> : null}
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 sm:max-w-md">
      <p className="text-xs font-medium">Enable ScolaPro access</p>
      <form action={inviteAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.8fr)_auto] sm:items-end">
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="staffMemberId" value={row.staffId} />
        <div>
          <label htmlFor={`staff-email-${row.staffId}`} className="block text-[0.68rem] text-muted-foreground">Login email</label>
          <input id={`staff-email-${row.staffId}`} name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="real email address" className="mt-1 min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-2.5 text-xs outline-none focus:border-[color:var(--brand)]/50" />
        </div>
        <div>
          <label htmlFor={`staff-role-${row.staffId}`} className="block text-[0.68rem] text-muted-foreground">Intended role</label>
          <Picker ariaLabel="Intended school role" value={roleKey} onChange={setRoleKey} options={roleOptions.map(([value, label]) => ({ value, label }))} placeholder="Choose role" className="mt-1" />
          <input type="hidden" name="roleKey" value={roleKey} />
        </div>
        <button type="submit" disabled={invitePending || !email} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-medium text-white disabled:opacity-50">
          <Link2 className="size-3.5" /> {invitePending ? "Inviting…" : "Invite"}
        </button>
      </form>
      {inviteState.invitationToken ? <p className="break-all rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-2 text-[0.68rem] text-[color:var(--success)]">Secure join link ready: <span className="font-mono">{`/join?token=${inviteState.invitationToken}`}</span></p> : null}
      <p className="text-[0.68rem] text-muted-foreground">Employee {row.employeeNumber ?? "number not set"} is bound automatically. The staff member chooses and controls their password.</p>
    </div>
  );
}