"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import {
  createPlatformSchoolInvitation,
  createSchoolStaffInvitation,
  type SchoolInvitationState,
} from "@/features/platform/server/actions";
import type { SchoolOption } from "@/features/platform/server/invitations";

const initialState: SchoolInvitationState = {};

const schoolRoles = [
  ["school_admin", "School administrator"],
  ["principal", "Principal"],
  ["deputy_principal", "Deputy principal"],
  ["hod", "Head of department"],
  ["teacher", "Teacher"],
  ["class_teacher", "Class teacher"],
  ["counsellor", "Learner support / counsellor"],
  ["social_worker", "Social worker / safeguarding"],
  ["librarian", "Librarian / LTSM"],
  ["board_member", "School board member"],
] as const;

type RoleKey = (typeof schoolRoles)[number][0];
type InvitationMode = "school" | "platform";

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

function Picker({ label, valueLabel, open, onToggle, children }: {
  label: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-1.5">
      <p className="text-xs font-medium leading-4">{label}</p>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-[var(--shadow-xs)] transition duration-[var(--motion-fast)] hover:border-border focus-visible:border-[color:var(--brand)]/50"
      >
        <span className="min-w-0 truncate">{valueLabel}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function schoolLabel(school: SchoolOption, mode: InvitationMode) {
  if (mode === "platform" && school.tenantName) return `${school.name} · ${school.tenantName}`;
  return school.name;
}

export function SchoolInvitationForm({ schools, mode }: { schools: SchoolOption[]; mode: InvitationMode }) {
  const action = mode === "platform" ? createPlatformSchoolInvitation : createSchoolStaffInvitation;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [copied, setCopied] = useState(false);
  const fixedSchool = mode === "school" ? schools[0] ?? null : null;
  const singlePlatformSchool = mode === "platform" && schools.length === 1 ? schools[0] : null;
  const [schoolId, setSchoolId] = useState(fixedSchool?.id ?? singlePlatformSchool?.id ?? "");
  const [roleKey, setRoleKey] = useState<RoleKey>(mode === "platform" ? "school_admin" : "teacher");
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const selectedSchool = schools.find((school) => school.id === schoolId);
  const selectedRole = schoolRoles.find(([value]) => value === roleKey)?.[1] ?? "Teacher";
  const joinLink = useMemo(() => {
    if (!state.invitationToken || typeof window === "undefined") return "";
    return `${window.location.origin}/join?token=${encodeURIComponent(state.invitationToken)}`;
  }, [state.invitationToken]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
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
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="roleKey" value={mode === "platform" ? "school_admin" : roleKey} />

        {mode === "school" ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium leading-4">School</p>
            <div className="flex min-h-10 items-center rounded-[var(--radius-sm)] bg-surface-elevated px-3 text-sm shadow-[var(--shadow-xs)]">
              <span className="min-w-0 truncate">{fixedSchool?.name ?? "School unavailable"}</span>
            </div>
            <p className="text-[0.68rem] leading-4 text-muted-foreground">This invitation is fixed to the school you are administering.</p>
          </div>
        ) : singlePlatformSchool ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium leading-4">School</p>
            <div className="flex min-h-10 items-center rounded-[var(--radius-sm)] bg-surface-elevated px-3 text-sm shadow-[var(--shadow-xs)]">
              <span className="min-w-0 truncate">{schoolLabel(singlePlatformSchool, mode)}</span>
            </div>
          </div>
        ) : (
          <>
            <Picker
              label="School"
              valueLabel={selectedSchool ? schoolLabel(selectedSchool, mode) : "Choose a school"}
              open={schoolOpen}
              onToggle={() => { setSchoolOpen((value) => !value); setRoleOpen(false); }}
            >
              {schools.map((school) => (
                <button
                  key={school.id}
                  type="button"
                  onClick={() => { setSchoolId(school.id); setSchoolOpen(false); }}
                  className={`flex w-full items-center rounded-[var(--radius-xs)] px-2.5 py-2 text-left text-sm transition hover:bg-surface-muted ${school.id === schoolId ? "bg-brand-soft text-brand-strong" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{school.name}</span>
                    {school.tenantName ? <span className="block truncate text-[0.68rem] text-muted-foreground">{school.tenantName}</span> : null}
                  </span>
                </button>
              ))}
            </Picker>
            <FieldError messages={state.fieldErrors?.schoolId} />
          </>
        )}

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="firstName" className="text-xs font-medium leading-4">First name</label>
            <input id="firstName" name="firstName" className={fieldClass} autoComplete="given-name" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="lastName" className="text-xs font-medium leading-4">Last name</label>
            <input id="lastName" name="lastName" className={fieldClass} autoComplete="family-name" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium leading-4">Email address</label>
          <input id="email" name="email" type="email" className={fieldClass} autoComplete="email" placeholder="user@school.edu.na" />
          <FieldError messages={state.fieldErrors?.email} />
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          {mode === "platform" ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-xs font-medium leading-4">Role</p>
              <div className="flex min-h-10 items-center rounded-[var(--radius-sm)] bg-surface-elevated px-3 text-sm shadow-[var(--shadow-xs)]">School administrator</div>
              <p className="text-[0.68rem] leading-4 text-muted-foreground">Platform onboarding establishes school administration only. The school then invites its own staff.</p>
            </div>
          ) : (
            <Picker
              label="Role"
              valueLabel={selectedRole}
              open={roleOpen}
              onToggle={() => { setRoleOpen((value) => !value); setSchoolOpen(false); }}
            >
              {schoolRoles.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setRoleKey(value); setRoleOpen(false); }}
                  className={`w-full rounded-[var(--radius-xs)] px-2.5 py-2 text-left text-sm transition hover:bg-surface-muted ${value === roleKey ? "bg-brand-soft text-brand-strong" : ""}`}
                >
                  {label}
                </button>
              ))}
            </Picker>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="employeeNumber" className="text-xs font-medium leading-4">Employee number</label>
            <input id="employeeNumber" name="employeeNumber" className={fieldClass} placeholder="Optional" />
          </div>
        </div>

        <div className="flex justify-end border-t border-border-subtle pt-4">
          <button type="submit" disabled={pending || !schools.length || !schoolId} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60">
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
