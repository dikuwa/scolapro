"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  GitMerge,
  KeyRound,
  Network,
  Link2,
  LoaderCircle,
  MailCheck,
  Pencil,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { RecordActionButton } from "@/components/ui/record-action-button";
import {
  addStaffRole,
  planStaffSchoolRole,
  endPlannedStaffSchoolRole,
  designateStaffOperationalHod,
  endStaffOperationalHod,
  correctStaffDetails,
  endStaffRole,
  inviteExistingStaff,
  reconcileStaffIdentities,
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

type StaffRowPanel = "access" | "identity" | "hod-placement" | null;

function roleLabel(value: string) {
  return roleOptions.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
}

function panelClassName() {
  return "col-span-full mt-1 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/45 p-3.5 text-xs shadow-[var(--shadow-xs)] md:col-start-2 md:col-end-4 lg:col-start-2 lg:col-end-5";
}

export function StaffDirectoryRowControls({
  schoolId,
  row,
  candidates,
  operationalHodReady,
  canPlanRoles = false,
}: {
  schoolId: string;
  row: StaffDirectoryRow;
  candidates: StaffDirectoryRow[];
  operationalHodReady: boolean;
  canPlanRoles?: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<StaffRowPanel>(null);
  const [inviteState, inviteAction, invitePending] = useActionState(inviteExistingStaff, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendExistingStaffInvitation, initialState);
  const [roleState, roleAction, rolePending] = useActionState(addStaffRole, initialState);
  const [planState, planAction, planPending] = useActionState(planStaffSchoolRole, initialState);
  const [verificationState, verificationAction, verificationPending] = useActionState(sendStaffVerification, initialState);
  const [resetState, resetAction, resetPending] = useActionState(sendStaffPasswordReset, initialState);
  const [correctionState, correctionAction, correctionPending] = useActionState(correctStaffDetails, initialState);
  const [reconciliationState, reconciliationAction, reconciliationPending] = useActionState(reconcileStaffIdentities, initialState);
  const [roleKey, setRoleKey] = useState<string>("teacher");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [roleDate, setRoleDate] = useState(today);
  const [hodDate, setHodDate] = useState(today);
  const [hodState, hodAction, hodPending] = useActionState(designateStaffOperationalHod, initialState);
  const [hodEndState, hodEndAction, hodEndPending] = useActionState(endStaffOperationalHod, initialState);
  const [email, setEmail] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const [endingRoleId, setEndingRoleId] = useState<string | null>(null);
  const [hiddenRoleIds, setHiddenRoleIds] = useState<Set<string>>(() => new Set());
  const [roleEndPending, startRoleEnd] = useTransition();

  useEffect(() => {
    if (inviteState.message) (inviteState.success ? toast.success : toast.error)(inviteState.message);
  }, [inviteState]);
  useEffect(() => {
    if (resendState.message) (resendState.success ? toast.success : toast.error)(resendState.message);
  }, [resendState]);
  useEffect(() => {
    if (planState.message) (planState.success ? toast.success : toast.error)(planState.message);
    if (planState.success) router.refresh();
  }, [planState, router]);
  useEffect(() => {
    if (roleState.message) (roleState.success ? toast.success : toast.error)(roleState.message);
    if (roleState.success) router.refresh();
  }, [roleState, router]);
  useEffect(() => {
    if (verificationState.message) (verificationState.success ? toast.success : toast.error)(verificationState.message);
  }, [verificationState]);
  useEffect(() => {
    if (resetState.message) (resetState.success ? toast.success : toast.error)(resetState.message);
  }, [resetState]);
  useEffect(() => {
    if (correctionState.message) (correctionState.success ? toast.success : toast.error)(correctionState.message);
    if (correctionState.success) router.refresh();
  }, [correctionState, router]);
  useEffect(() => {
    if (reconciliationState.message) (reconciliationState.success ? toast.success : toast.error)(reconciliationState.message);
    if (reconciliationState.success) router.refresh();
  }, [reconciliationState, router]);

  useEffect(() => {
    if (hodState.message) (hodState.success ? toast.success : toast.error)(hodState.message);
    if (hodState.success) router.refresh();
  }, [hodState, router]);
  useEffect(() => {
    if (hodEndState.message) (hodEndState.success ? toast.success : toast.error)(hodEndState.message);
    if (hodEndState.success) router.refresh();
  }, [hodEndState, router]);

  function togglePanel(next: Exclude<StaffRowPanel, null>) {
    setPanel((current) => current === next ? null : next);
  }

  function endRoleAction(formData: FormData) {
    const membershipId = String(formData.get("membershipId") ?? "");
    setEndingRoleId(membershipId);
    startRoleEnd(async () => {
      const result = await endStaffRole(formData);
      if (result.message) (result.success ? toast.success : toast.error)(result.message);
      if (result.success) {
        setHiddenRoleIds((current) => new Set(current).add(membershipId));
        router.refresh();
      }
      setEndingRoleId(null);
    });
  }

  if (!row.staffId) {
    return (
      <div className="min-w-0 rounded-[var(--radius-sm)] bg-surface-muted/35 px-3 py-2.5 text-xs text-muted-foreground md:col-start-2 md:col-end-4 lg:col-start-4 lg:col-end-5">
        Membership-only account
      </div>
    );
  }

  const visibleRoles = row.activeRoles.filter((item) => !hiddenRoleIds.has(item.id));
  const eligiblePlannedRoles = row.plannedRoles.filter((plan) =>
    !plan.revokedAt && (!plan.effectiveTo || plan.effectiveTo >= today)
  );
  const invitationRoleKey = eligiblePlannedRoles[0]?.roleKey ?? "";
  const rolePreview = visibleRoles.slice(0, 2).map((item) => roleLabel(item.roleKey));
  const hiddenRoleCount = Math.max(visibleRoles.length - rolePreview.length, 0);
  const duplicateOptions = candidates
    .filter((candidate) => candidate.staffId && candidate.staffId !== row.staffId)
    .map((candidate) => ({
      value: candidate.staffId as string,
      label: `${candidate.name} · ${candidate.employeeNumber ?? "no employee number"}`,
    }));

  return (
    <>
      <div className="min-w-0 rounded-[var(--radius-sm)] bg-surface-muted/35 px-3 py-2.5 md:col-start-2 md:col-end-4 lg:col-start-4 lg:col-end-5">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[0.68rem]">
            {row.hasAccount ? (
              <>
                <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 font-medium text-[color:var(--success)]">Account linked</span>
                <span className="text-muted-foreground">{visibleRoles.length} active {visibleRoles.length === 1 ? "role" : "roles"}{rolePreview.length ? ` · ${rolePreview.join(" · ")}` : ""}{hiddenRoleCount ? ` · +${hiddenRoleCount}` : ""}</span>
              </>
            ) : row.pendingInvitationId ? (
              <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 font-medium text-[color:var(--warning)]">Invitation pending</span>
            ) : (
              <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 font-medium text-muted-foreground">No login account</span>
            )}
          </div>

          {row.plannedRoles.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {row.plannedRoles.map((plan) => {
                const status = plan.revokedAt
                  ? "Revoked"
                  : plan.effectiveTo && plan.effectiveTo < today
                    ? "Ended"
                    : plan.effectiveFrom > today
                      ? "Scheduled"
                      : row.hasAccount
                        ? "Active on account"
                        : "Planned";
                return (
                  <span key={plan.id} className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.68rem] text-brand-strong">
                    {roleLabel(plan.roleKey)} · {status}
                    {!row.hasAccount && !plan.revokedAt && (!plan.effectiveTo || plan.effectiveTo >= today) ? (
                      <form action={async (data: FormData) => {
                        const result = await endPlannedStaffSchoolRole(data);
                        if (result.message) (result.success ? toast.success : toast.error)(result.message);
                        if (result.success) router.refresh();
                      }}>
                        <input type="hidden" name="schoolId" value={schoolId} />
                        <input type="hidden" name="plannedRoleId" value={plan.id} />
                        <button type="submit" aria-label={`End planned ${roleLabel(plan.roleKey)} role`} className="ml-1 text-brand-strong hover:text-[color:var(--danger)]"><X className="size-3" /></button>
                      </form>
                    ) : null}
                  </span>
                );
              })}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {row.hasAccount ? (
              <Button
                type="button"
                variant="neutral"
                size="sm"
                onClick={() => togglePanel("access")}
                aria-expanded={panel === "access"}
                className="min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem]"
              >
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Manage access
                <ChevronDown className={`size-3.5 transition-transform ${panel === "access" ? "rotate-180" : ""}`} aria-hidden="true" />
              </Button>
            ) : row.pendingInvitationId ? (
              <form action={resendAction}>
                <input type="hidden" name="invitationId" value={row.pendingInvitationId} />
                <Button
                  type="submit"
                  variant="soft"
                  size="sm"
                  loading={resendPending}
                  className="min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem]"
                >
                  <Link2 className="size-3.5" aria-hidden="true" /> Resend
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => togglePanel("access")}
                aria-expanded={panel === "access"}
                className="min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem]"
              >
                <Link2 className="size-3.5" aria-hidden="true" />
                Invite
                <ChevronDown className={`size-3.5 transition-transform ${panel === "access" ? "rotate-180" : ""}`} aria-hidden="true" />
              </Button>
            )}
            {!row.hasAccount && canPlanRoles ? (
              <Button type="button" variant="neutral" size="sm" onClick={() => togglePanel("access")}
                aria-expanded={panel === "access"}
                className="min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem]">
                <ShieldCheck className="size-3.5" aria-hidden="true" /> Assign roles
              </Button>
            ) : null}
            <Button
              type="button"
              variant="neutral"
              size="sm"
              aria-expanded={panel === "hod-placement"}
              onClick={() => togglePanel("hod-placement")}
              className="min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem]"
            >
              <Network className="size-3.5" aria-hidden="true" />
              {row.operationalHodDesignation ? "HOD placement" : "Assign HOD"}
              <ChevronDown className={`size-3.5 transition-transform ${panel === "hod-placement" ? "rotate-180" : ""}`} aria-hidden="true" />
            </Button>
            <RecordActionButton
              icon={Pencil}
              label="Manage identity"
              expanded={panel === "identity"}
              onClick={() => togglePanel("identity")}
            />
          </div>
        </div>

        {resendState.invitationToken ? (
          <p className="mt-2 break-all rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-2 text-[0.68rem] text-[color:var(--success)]">
            New join link: <span className="font-mono">{`/join?token=${resendState.invitationToken}`}</span>
          </p>
        ) : null}
      </div>

      {panel === "access" ? (
        <div className={panelClassName()}>
          {row.hasAccount ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Access management</h3>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Active school roles control what this linked account can use.</p>
                  </div>
                  <span className="text-[0.68rem] font-medium text-muted-foreground">
                    {visibleRoles.length} {visibleRoles.length === 1 ? "role" : "roles"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {visibleRoles.length ? visibleRoles.map((item) => {
                    const isEnding = roleEndPending && endingRoleId === item.id;
                    return (
                      <span key={item.id} className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.68rem] font-medium text-brand-strong">
                        {roleLabel(item.roleKey)}
                        <form action={endRoleAction}>
                          <input type="hidden" name="schoolId" value={schoolId} />
                          <input type="hidden" name="membershipId" value={item.id} />
                          <button
                            type="submit"
                            disabled={isEnding}
                            aria-label={isEnding ? `Ending ${roleLabel(item.roleKey)} role` : `End ${roleLabel(item.roleKey)} role`}
                            className="grid size-4 place-items-center text-brand-strong transition hover:text-danger disabled:cursor-wait disabled:opacity-60"
                          >
                            {isEnding ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : <X className="size-3" aria-hidden="true" />}
                          </button>
                        </form>
                      </span>
                    );
                  }) : <span className="text-[0.68rem] text-muted-foreground">No active ScolaPro roles.</span>}
                </div>
                <form action={roleAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="schoolId" value={schoolId} />
                  <input type="hidden" name="staffMemberId" value={row.staffId} />
                  <input type="hidden" name="roleKey" value={roleKey} />
                  <Picker
                    ariaLabel="Add school role"
                    value={roleKey}
                    onChange={setRoleKey}
                    options={roleOptions.map(([value, label]) => ({ value, label }))}
                    placeholder="Choose role"
                    className="min-w-44"
                  />
                  <Button type="submit" variant="neutral" size="sm" loading={rolePending}>
                    <Plus className="size-3.5" aria-hidden="true" /> Add role
                  </Button>
                </form>
              </div>

              <div className="rounded-[var(--radius-sm)] bg-surface px-3 py-3">
                <p className="text-xs font-semibold text-foreground">Account actions</p>
                <p className="mt-0.5 text-[0.68rem] leading-4 text-muted-foreground">Send account emails without changing staff placement or role history.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={verificationAction}>
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="staffMemberId" value={row.staffId} />
                    <Button type="submit" variant="ghost" size="sm" loading={verificationPending}>
                      <MailCheck className="size-3.5" aria-hidden="true" /> Verification email
                    </Button>
                  </form>
                  <form action={resetAction}>
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="staffMemberId" value={row.staffId} />
                    <Button type="submit" variant="ghost" size="sm" loading={resetPending}>
                      <KeyRound className="size-3.5" aria-hidden="true" /> Password reset
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Invite to ScolaPro</h3>
                <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Create login access without changing the staff placement.</p>
              </div>
              {canPlanRoles ? <form action={planAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-[var(--radius-sm)] bg-surface p-3">
                <input type="hidden" name="schoolId" value={schoolId} />
                <input type="hidden" name="staffMemberId" value={row.staffId} />
                <input type="hidden" name="roleKey" value={roleKey} />
                <Picker ariaLabel="Preassign school role" value={roleKey} onChange={setRoleKey}
                  options={roleOptions.map(([value,label]) => ({value,label}))} placeholder="Choose role" className="min-w-44" />
                <DateField label="Effective from" name="effectiveFrom" value={roleDate} onChange={setRoleDate} />
                <Button type="submit" variant="neutral" size="sm" loading={planPending}>
                  <Plus className="size-3.5" aria-hidden="true" /> Preassign role
                </Button>
                <p className="basis-full text-[0.68rem] text-muted-foreground">Current roles activate only after verified login acceptance; future-dated roles stay inactive until their effective date.</p>
              </form> : null}
              <form action={inviteAction} className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <input type="hidden" name="schoolId" value={schoolId} />
                <input type="hidden" name="staffMemberId" value={row.staffId} />
                <input type="hidden" name="roleKey" value={invitationRoleKey} />
                <div>
                  <label htmlFor={`staff-email-${row.staffId}`} className="block text-[0.68rem] text-muted-foreground">Login email</label>
                  <input
                    id={`staff-email-${row.staffId}`}
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="real email address"
                    className="mt-1 min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-2.5 text-xs outline-none focus:border-[color:var(--brand)]/50"
                  />
                </div>
                <Button type="submit" size="sm" loading={invitePending} disabled={!email || !invitationRoleKey}>
                  <Link2 className="size-3.5" aria-hidden="true" /> Send invite
                </Button>
                <p className="basis-full text-[0.68rem] text-muted-foreground">
                  {invitationRoleKey
                    ? `This invitation will use the ${eligiblePlannedRoles.length} current or scheduled preassigned ${eligiblePlannedRoles.length === 1 ? "role" : "roles"} above; no extra role is granted by the invitation.`
                    : "Assign at least one current or scheduled role before creating login access."}
                </p>
              </form>
              {inviteState.invitationToken ? (
                <p className="mt-3 break-all rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-2 text-[0.68rem] text-[color:var(--success)]">
                  Secure join link ready: <span className="font-mono">{`/join?token=${inviteState.invitationToken}`}</span>
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {panel === "hod-placement" ? (
        <div className={panelClassName()} data-staff-operational-hod>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">HOD staff placement</h3>
            <p className="mt-1 text-[0.72rem] leading-5 text-muted-foreground">
              Designate an existing staff member as HOD without creating a ScolaPro account or sending an invitation.
              This permits later subject-portfolio appointment; login access and HOD review permissions remain separate.
            </p>
          </div>
          {!operationalHodReady ? (
            <p role="status" className="mb-3 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-xs text-[color:var(--warning)]">
              HOD placement changes are unavailable until the operational HOD database migration is deployed.
              Existing staff and login records remain accessible.
            </p>
          ) : null}
          {row.operationalHodDesignation ? (
            <form action={hodEndAction} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3">
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="designationId" value={row.operationalHodDesignation.id} />
              <div>
                <p className="font-semibold text-foreground">Operational HOD assigned</p>
                <p className="mt-1 text-muted-foreground">Effective from {row.operationalHodDesignation.effectiveFrom}. Ending this designation also closes its open portfolio authority on the selected date.</p>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-3">
                <div className="min-w-[12rem] flex-1 sm:max-w-xs"><DateField label="Effective to" name="effectiveTo" value={hodDate} onChange={setHodDate} /></div>
              <Button type="submit" variant="neutral" size="sm" disabled={!operationalHodReady || hodEndPending || hodDate < row.operationalHodDesignation.effectiveFrom} loading={hodEndPending}>
                End HOD placement
              </Button>
              </div>
            </form>
          ) : (
            <form action={hodAction} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3">
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="staffMemberId" value={row.staffId} />
              <p className="text-muted-foreground">No operational HOD designation. The staff member keeps their existing placement and login status.</p>
              <div className="flex flex-wrap items-end justify-end gap-3">
                <div className="min-w-[12rem] flex-1 sm:max-w-xs"><DateField label="Effective from" name="effectiveFrom" value={hodDate} onChange={setHodDate} /></div>
              <Button type="submit" size="sm" disabled={!operationalHodReady || hodPending || !hodDate} loading={hodPending}>
                <Network className="size-3.5" aria-hidden="true" /> Assign HOD placement
              </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {panel === "identity" ? (
        <div className={panelClassName()}>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">Identity management</h3>
            <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Correct staff metadata or reconcile an evidenced duplicate without changing login credentials.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <form action={correctionAction} className="space-y-2 rounded-[var(--radius-sm)] bg-surface p-3">
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="staffMemberId" value={row.staffId} />
              <p className="flex items-center gap-1.5 font-semibold"><Pencil className="size-3.5" aria-hidden="true" /> Correct staff details</p>
              <p className="text-[0.68rem] leading-4 text-muted-foreground">Correct typos, employee number or current position metadata. This never changes Auth email or password.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="firstName" defaultValue={row.name.split(" ")[0] ?? ""} aria-label="Correct first name" placeholder="First name" className="min-h-9 rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs" />
                <input name="lastName" defaultValue={row.name.split(" ").slice(1).join(" ")} aria-label="Correct surname" placeholder="Surname" className="min-h-9 rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs" />
                <input name="employeeNumber" defaultValue={row.employeeNumber ?? ""} aria-label="Correct employee number" placeholder="Employee number" className="min-h-9 rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs" />
                <input name="positionTitle" aria-label="Correct position title" placeholder="Position title" className="min-h-9 rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs" />
              </div>
              <input name="reason" aria-label="Correction reason" placeholder="Reason / source (optional)" className="min-h-9 w-full rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs" />
              <Button type="submit" size="sm" loading={correctionPending}>Save audited correction</Button>
            </form>

            <form action={reconciliationAction} className="space-y-2 rounded-[var(--radius-sm)] bg-surface p-3">
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="canonicalStaffMemberId" value={row.staffId} />
              <p className="flex items-center gap-1.5 font-semibold"><GitMerge className="size-3.5" aria-hidden="true" /> Reconcile duplicate</p>
              <p className="text-[0.68rem] leading-4 text-muted-foreground">Canonical: <strong>{row.name}</strong>. Names alone never auto-merge. Verify employee number, account or placement evidence first.</p>
              <Picker ariaLabel="Duplicate staff identity" value={duplicateId} onChange={setDuplicateId} options={duplicateOptions} placeholder="Choose duplicate identity" />
              <input type="hidden" name="duplicateStaffMemberId" value={duplicateId} />
              <input name="confirmation" aria-label="Reconciliation confirmation" placeholder="Type RECONCILE" className="min-h-9 w-full rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs uppercase" />
              <input name="reason" aria-label="Reconciliation reason" placeholder="Evidence / reason (required for audit)" className="min-h-9 w-full rounded-[var(--radius-xs)] border border-border-subtle bg-surface-elevated px-2.5 text-xs" />
              <Button type="submit" variant="neutral" size="sm" loading={reconciliationPending} disabled={!duplicateId}>Confirm reconciliation</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
