"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown, Users } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import {
  allocateDetentionLearners,
  createPlannedDetentionSession,
  updateDetentionDutyTeam,
  type DetentionPlanningActionState,
} from "@/features/late-arrivals/server/planning-actions";
import type {
  DetentionPlanningLearner,
  DetentionPlanningSession,
  DetentionPlanningStaff,
} from "@/features/late-arrivals/server/planning-queries";

const initialState: DetentionPlanningActionState = {};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function nextFriday(today: string) {
  const date = new Date(`${today}T12:00:00`);
  const delta = (5 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function StaffChoice({ member, checked, onToggle }: { member: DetentionPlanningStaff; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-xs)] border px-2.5 text-left transition ${checked ? "border-[color:var(--brand)]/35 bg-brand-soft" : "border-transparent hover:bg-surface-muted"}`}>
      <span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? "border-[color:var(--brand)] bg-brand text-white" : "border-border"}`}>{checked ? <Check className="size-3" aria-hidden="true" /> : null}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{member.name}</span>
        <span className="block truncate text-[0.65rem] text-muted-foreground">{member.employeeNumber ?? "Staff member"}</span>
      </span>
      <span className={`shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[0.6rem] font-medium ${member.eligible ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground"}`}>{member.eligible ? "Preferred" : "General staff"}</span>
    </button>
  );
}

function StepBadge({ number, label }: { number: number; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.65rem] font-semibold text-brand-strong"><span className="grid size-4 place-items-center rounded-full bg-brand text-[0.6rem] text-white">{number}</span>{label}</span>;
}

export function DetentionPlanner({ schoolId, today, sessions, queue, staff }: { schoolId: string; today: string; sessions: DetentionPlanningSession[]; queue: DetentionPlanningLearner[]; staff: DetentionPlanningStaff[] }) {
  const [createState, createAction, createPending] = useActionState(createPlannedDetentionSession, initialState);
  const [teamState, teamAction, teamPending] = useActionState(updateDetentionDutyTeam, initialState);
  const [allocateState, allocateAction, allocatePending] = useActionState(allocateDetentionLearners, initialState);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [existingTeamOpen, setExistingTeamOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState(nextFriday(today));
  const [newTeam, setNewTeam] = useState<string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? "");
  const [editingTeam, setEditingTeam] = useState<string[]>(sessions[0]?.supervisorIds ?? []);
  const [selectedObligations, setSelectedObligations] = useState<string[]>([]);
  const [allocationSupervisor, setAllocationSupervisor] = useState(sessions[0]?.supervisorIds[0] ?? "");

  useEffect(() => {
    for (const state of [createState, teamState, allocateState]) {
      if (!state.message) continue;
      if (state.success) toast.success(state.message);
      else toast.error(state.message);
    }
  }, [createState, teamState, allocateState]);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectableStaff = [...staff].sort((left, right) => Number(right.eligible) - Number(left.eligible) || left.name.localeCompare(right.name));
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const scheduledElsewhere = new Set(sessions.flatMap((session) => session.learnerAssignments.filter((item) => item.attendanceStatus === "scheduled" && session.id !== selectedSessionId).map((item) => item.obligationId)));
  const eligibleQueue = selectedSession ? queue.filter((item) => item.dueOn <= selectedSession.sessionDate && !scheduledElsewhere.has(item.obligationId)) : [];
  const groups = new Map<string, DetentionPlanningLearner[]>();
  for (const item of eligibleQueue) groups.set(item.registerClass, [...(groups.get(item.registerClass) ?? []), item]);
  const groupedQueue = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const nextSession = sessions[0] ?? null;

  const selectSession = (session: DetentionPlanningSession) => {
    setSelectedSessionId(session.id);
    setEditingTeam(session.supervisorIds);
    setAllocationSupervisor(session.supervisorIds[0] ?? "");
    setSelectedObligations([]);
    setExistingTeamOpen(false);
  };

  const toggleClass = (items: DetentionPlanningLearner[]) => {
    const ids = items.map((item) => item.obligationId);
    const allSelected = ids.every((id) => selectedObligations.includes(id));
    setSelectedObligations((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <button type="button" onClick={() => setPlannerOpen((open) => !open)} aria-expanded={plannerOpen} className="flex min-h-20 w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-muted/45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-soft)] sm:px-5">
        <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><CalendarDays className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="scolapro-section-title">Friday detention planning</h2><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.65rem] font-medium text-muted-foreground">{sessions.length} planned</span><span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[0.65rem] font-medium text-[color:var(--warning)]">{queue.length} open obligations</span></div>
          <p className="scolapro-section-description">{nextSession ? `Next: ${formatDate(nextSession.sessionDate)} · ${nextSession.supervisorIds.length} supervisors. Expand to change the plan or allocate due detention obligations.` : "No detention date planned yet. Expand to create the first session, roster a duty team and allocate due detention obligations."}</p>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${plannerOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {plannerOpen ? (
        <div className="border-t border-border-subtle p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Friday detention planning steps"><StepBadge number={1} label="Session" /><StepBadge number={2} label="Duty team" /><StepBadge number={3} label="Allocate obligations" /></div>
          <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
            <div className="space-y-5">
              <form action={createAction} className="rounded-[var(--radius-md)] bg-surface-muted/55 p-4">
                <input type="hidden" name="schoolId" value={schoolId} />
                {newTeam.map((id) => <input key={id} type="hidden" name="staffMemberIds" value={id} />)}
                <div className="flex items-center justify-between gap-2"><div><StepBadge number={1} label="Session" /><h3 className="mt-2 text-sm font-semibold">Plan a detention date</h3></div></div>
                <p className="mt-1 text-xs text-muted-foreground">The coming Friday is preselected. You can also roster detention several weeks ahead.</p>
                <DateField label="Detention date" name="sessionDate" value={sessionDate} onChange={setSessionDate} min={today} required className="mt-3" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium">Starts at<input name="startsAt" type="time" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
                  <label className="text-xs font-medium">Ends at<input name="endsAt" type="time" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
                </div>
                <label className="mt-3 block text-xs font-medium">Location<input name="location" placeholder="e.g. Room 12" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>

                <div className="mt-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated">
                  <button type="button" onClick={() => setNewTeamOpen((open) => !open)} aria-expanded={newTeamOpen} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left">
                    <div><p className="text-xs font-semibold">Step 2 · Duty team</p><p className="text-[0.65rem] text-muted-foreground">{newTeam.length ? `${newTeam.length} selected` : "Select supervisors for this date"}</p></div>
                    <ChevronDown className={`size-4 text-muted-foreground transition-transform ${newTeamOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {newTeamOpen ? <div className="border-t border-border-subtle p-2"><div className="max-h-56 space-y-1 overflow-auto">{selectableStaff.map((member) => <StaffChoice key={member.id} member={member} checked={newTeam.includes(member.id)} onToggle={() => setNewTeam((current) => toggleValue(current, member.id))} />)}</div><p className="mt-1.5 px-1 text-[0.65rem] text-muted-foreground">Any active staff member placed at the school may supervise detention. Preferred detention staff are listed first.</p></div> : null}
                </div>

                <button type="submit" disabled={createPending || !newTeam.length} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{createPending ? <Spinner className="size-4 text-white" /> : <CalendarDays className="size-4" aria-hidden="true" />}{createPending ? "Scheduling…" : "Schedule detention"}</button>
              </form>

              <div>
                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Upcoming dates</h3><span className="text-xs text-muted-foreground">{sessions.length} planned</span></div>
                <div className="mt-2 space-y-2">
                  {sessions.map((session) => <button key={session.id} type="button" onClick={() => selectSession(session)} className={`w-full rounded-[var(--radius-sm)] border p-3 text-left transition ${selectedSessionId === session.id ? "border-[color:var(--brand)]/35 bg-brand-soft" : "border-border-subtle bg-surface hover:border-border"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{formatDate(session.sessionDate)}</span><span className="text-[0.65rem] text-muted-foreground">{session.supervisorIds.length} staff · {session.learnerAssignments.length} learners</span></div><p className="mt-1 text-[0.65rem] text-muted-foreground">{session.location ?? "Location not set"}{session.startsAt ? ` · ${session.startsAt.slice(0, 5)}` : ""}</p></button>)}
                  {!sessions.length ? <div className="rounded-[var(--radius-sm)] border border-dashed border-border p-4 text-xs text-muted-foreground">No upcoming detention dates have been scheduled yet.</div> : null}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              {selectedSession ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle">
                    <button type="button" onClick={() => setExistingTeamOpen((open) => !open)} aria-expanded={existingTeamOpen} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/45">
                      <div><StepBadge number={2} label="Duty team" /><p className="mt-1 text-sm font-semibold">{formatDate(selectedSession.sessionDate)}</p><p className="text-xs text-muted-foreground">{selectedSession.supervisorIds.length} supervisors rostered. Expand only when the team needs changing.</p></div>
                      <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${existingTeamOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    {existingTeamOpen ? <form action={teamAction} className="border-t border-border-subtle p-4"><input type="hidden" name="sessionId" value={selectedSession.id} />{editingTeam.map((id) => <input key={id} type="hidden" name="staffMemberIds" value={id} />)}<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{selectableStaff.map((member) => <StaffChoice key={member.id} member={member} checked={editingTeam.includes(member.id)} onToggle={() => setEditingTeam((current) => toggleValue(current, member.id))} />)}</div><p className="mt-2 text-[0.65rem] text-muted-foreground">All active school staff are available here; preferred detention staff are shown first.</p><button type="submit" disabled={teamPending || !editingTeam.length} className="mt-3 min-h-9 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-45">{teamPending ? "Saving team…" : "Save duty team"}</button></form> : null}
                  </div>

                  <form action={allocateAction} className="rounded-[var(--radius-md)] border border-border-subtle p-4">
                    <input type="hidden" name="sessionId" value={selectedSession.id} />
                    {selectedObligations.map((id) => <input key={id} type="hidden" name="obligationIds" value={id} />)}
                    <input type="hidden" name="supervisorStaffMemberId" value={allocationSupervisor} />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div><StepBadge number={3} label="Allocate obligations" /><h3 className="mt-2 text-sm font-semibold">Allocate due detention obligations</h3><p className="mt-1 max-w-xl text-xs text-muted-foreground">Only learners with an open detention obligation due by this session are shown. Select an entire class group or individual obligations, then assign them to one rostered supervisor.</p></div>
                      <div className="w-full sm:max-w-xs"><Picker ariaLabel="Allocate selected detention obligations to supervisor" value={allocationSupervisor} onChange={setAllocationSupervisor} placeholder="Choose supervisor" searchable searchPlaceholder="Search duty team" options={selectedSession.supervisorIds.map((id) => ({ value: id, label: staffById.get(id)?.name ?? "Supervisor", helper: staffById.get(id)?.employeeNumber ?? undefined }))} /></div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {groupedQueue.map(([className, items]) => {
                        const allSelected = items.every((item) => selectedObligations.includes(item.obligationId));
                        return (
                          <div key={className} className="overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle">
                            <button type="button" onClick={() => toggleClass(items)} className="flex min-h-10 w-full items-center justify-between gap-3 bg-surface-muted/55 px-3 text-left"><span className="text-xs font-semibold">{className}</span><span className="text-[0.65rem] font-medium text-muted-foreground">{allSelected ? "Clear class" : `Select all ${items.length}`}</span></button>
                            <div className="divide-y divide-border-subtle">
                              {items.map((item) => {
                                const checked = selectedObligations.includes(item.obligationId);
                                const currentAssignment = selectedSession.learnerAssignments.find((assignment) => assignment.obligationId === item.obligationId);
                                return <button key={item.obligationId} type="button" onClick={() => setSelectedObligations((current) => toggleValue(current, item.obligationId))} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-surface-muted/45"><span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? "border-[color:var(--brand)] bg-brand text-white" : "border-border"}`}>{checked ? <Check className="size-3" aria-hidden="true" /> : null}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{item.learnerName}</span><span className="block text-[0.65rem] text-muted-foreground">Due {formatDate(item.dueOn)}{currentAssignment?.supervisorStaffMemberId ? ` · assigned to ${staffById.get(currentAssignment.supervisorStaffMemberId)?.name ?? "supervisor"}` : ""}</span></span></button>;
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {!groupedQueue.length ? <div className="rounded-[var(--radius-sm)] border border-dashed border-border p-5 text-center text-xs text-muted-foreground">No eligible open detention obligations for this date.</div> : null}
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{selectedObligations.length} obligation{selectedObligations.length === 1 ? "" : "s"} selected</p><button type="submit" disabled={allocatePending || !allocationSupervisor || !selectedObligations.length} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{allocatePending ? <Spinner className="size-4 text-white" /> : <Users className="size-4" aria-hidden="true" />}{allocatePending ? "Assigning…" : "Assign selected obligations"}</button></div>
                  </form>
                </div>
              ) : (
                <div className="grid min-h-72 place-items-center rounded-[var(--radius-md)] border border-dashed border-border p-6 text-center"><div><Users className="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><p className="mt-2 text-sm font-semibold">Plan a detention date first</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Once a Friday session exists, roster the duty team and allocate only the detention obligations due for that session.</p></div></div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
