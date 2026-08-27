"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Copy, LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { createSchoolInvitation, type SchoolInvitationState } from "@/features/platform/server/actions";
import type { SchoolOption } from "@/features/platform/server/invitations";

const initialState: SchoolInvitationState = {};

const roles = [
  ["school_admin", "School administrator"],
  ["principal", "Principal"],
  ["deputy_principal", "Deputy principal"],
  ["hod", "Head of department"],
  ["teacher", "Teacher"],
  ["class_teacher", "Class teacher"],
  ["counsellor", "Learner support / counsellor"],
  ["librarian", "Librarian / LTSM"],
  ["board_member", "School board member"],
] as const;

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

export function SchoolInvitationForm({ schools }: { schools: SchoolOption[] }) {
  const [state, action, pending] = useActionState(createSchoolInvitation, initialState);
  const [copied, setCopied] = useState(false);
  const joinLink = useMemo(() => {
    if (!state.invitationToken || typeof window === "undefined") return "";
    return `${window.location.origin}/join?token=${encodeURIComponent(state.invitationToken)}`;
  }, [state.invitationToken]);

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  async function copyLink() {
    if (!joinLink) return;
    await navigator.clipboard.writeText(joinLink);
    setCopied(true);
    toast.success("Invitation link copied.");
    window.setTimeout(() => setCopied(false), 1800);
  }

  const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4" noValidate>
        <div>
          <label htmlFor="schoolId" className="text-xs font-medium">School</label>
          <select id="schoolId" name="schoolId" defaultValue="" className={`${fieldClass} mt-1.5`}>
            <option value="" disabled>Choose a school</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>{school.name} · {school.tenantName}</option>
            ))}
          </select>
          <FieldError messages={state.fieldErrors?.schoolId} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="text-xs font-medium">First name</label>
            <input id="firstName" name="firstName" className={`${fieldClass} mt-1.5`} autoComplete="given-name" />
          </div>
          <div>
            <label htmlFor="lastName" className="text-xs font-medium">Last name</label>
            <input id="lastName" name="lastName" className={`${fieldClass} mt-1.5`} autoComplete="family-name" />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="text-xs font-medium">Email address</label>
          <input id="email" name="email" type="email" className={`${fieldClass} mt-1.5`} autoComplete="email" placeholder="user@school.edu.na" />
          <FieldError messages={state.fieldErrors?.email} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="roleKey" className="text-xs font-medium">Role</label>
            <select id="roleKey" name="roleKey" defaultValue="school_admin" className={`${fieldClass} mt-1.5`}>
              {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="employeeNumber" className="text-xs font-medium">Employee number</label>
            <input id="employeeNumber" name="employeeNumber" className={`${fieldClass} mt-1.5`} placeholder="Optional" />
          </div>
        </div>

        <div className="flex justify-end border-t border-border-subtle pt-4">
          <button type="submit" disabled={pending || !schools.length} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {pending ? "Creating…" : "Create invitation"}
          </button>
        </div>
      </form>

      {joinLink ? (
        <div className="rounded-[var(--radius-sm)] bg-success-soft p-3.5">
          <p className="text-xs font-medium text-[color:var(--success)]">Secure join link</p>
          <p className="mt-1 break-all text-xs leading-5 text-foreground">{joinLink}</p>
          <button type="button" onClick={copyLink} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-surface px-3 text-xs font-medium shadow-[var(--shadow-xs)] transition hover:bg-surface-muted">
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
