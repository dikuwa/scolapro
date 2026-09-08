"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
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

function isStaffAvailableOn(member: DetentionPlanningStaff, date: string) {
  return member.availabilityWindows.some(
    (window) => window.effectiveFrom <= date && (window.effectiveTo === null || window.effectiveTo >= date),
  );
}

function sortStaff(staff: DetentionPlanningStaff[]) {
  return [...staff].sort((left, right) => left.name.localeCompare(right.name));
}

function StaffChoice({ member, checked, onToggle }: { member: DetentionPlanningStaff; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-xs)] border px-2.5 text-left transition ${checked ? "border-[color:var(--brand)]/35 bg-brand-soft" : "border-transparent hover:bg-surface-muted"}`}>
      <span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? "border-[color:var(--brand)] bg-brand text-white" : "border-border"}`}>{checked ? <Check className="size-3" aria-hidden="true" /> : null}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{member.name}</span>
        <span className="block truncate text-[0.65rem] text-muted-foreground">{member.employeeNumber ?? "Staff member"}</span>
      </span>
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
  const selectableStaff = sortStaff(staff);
  const staffForNewSession = selectableStaff.filter((member) => isStaffAvailableOn(member, sessionDate));
  const staffForSelectedSession = selectedSession
    ? selectableStaff.filter((member) => isStaffAvailableOn(member, selectedSession.sessionDate))
    : [];
  const scheduledElsewhere = new Set(sessions.flatMap((session) => session.learnerAssignments.filter((item) => item.attendanceStatus === "scheduled" && session.id !== selectedSessionId).map((item) => item.obligationId)));
  const eligibleQueue = selectedSession ? queue.filter((item) => item.dueOn <= selectedSession.sessionDate && !scheduledElsewhere.has(item.obligationId)) : [];
  const groups = new Map<string, DetentionPlanningLearner[]>();
  for (const item of eligibleQueue) groups.set(item.registerClass, [...(groups.get(item.registerClass) ?? []), item]);
  const groupedQueue = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const nextSession = sessions[0] ?? null;
  const staffById = new Map(staff.map((member) => [member.id, member]));

  const changeSessionDate = (date: string) => {
    setSessionDate(date);
    setNewTeam((current) => current.filter((id) => {
      const member = staffById.get(id);
      return member ? isStaffAvailableOn(member, date) : false;
    }));
  };

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
          <div className="flex flex-wrap items-center gap-2"><h2 className="scolapro-section-title">Detention roster planning</h2><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.65rem] font-medium text-muted-foreground">{sessions.length} planned</span><span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[0.65rem] font-medium text-[color:var(--warning)]">{queue.length} open obligations</span></div>
          <p className="scolapro-section-description">{nextSession ? `Next: ${formatDate(nextSession.sessionDate)} · ${nextSession.supervisorIds.length} supervisors. Expand to change the roster or allocate due detention obligations.` : "No detention date planned yet. Expand to create a session, choose its supervisors and allocate due detention obligations."}</p>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${plannerOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {plannerOpen ? (
        <div className="border-t border-border-subtle p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Detention planning steps"><StepBadge number={1} label="Session" /><StepBadge number={2} label="Supervisors" /><StepBadge number={3} label="Allocate learners" /></div>
          <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
            <div className="space-y-5">
              <form action={createAction} className="rounded-[var(--radius-md)] bg-surface-muted/55 p-4">
                <input type="hidden" name="schoolId" value={schoolId} />
                {newTeam.map((id) => <input key={id} type="hidden" name="staffMemberIds" value={id} />)}
                <div className="flex items-center justify-between gap-2"><div><StepBadge number={1} label="Session" /><h3 className="mt-2 text-sm font-semibold">Plan a detention date</h3></div></div>
                <p className="mt-1 text-xs text-muted-foreground">The coming Friday is preselected. You can also roster detention several weeks ahead.</p>
                <DateField label="Detention date" name="sessionDate" value={sessionDate} onChange={changeSessionDate} min={today} required className="mt-3" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium">Starts at<input name="startsAt" type="time" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
                  <label className="text-xs font-medium">Ends at<input name="endsAt" type="time" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
                </div>
                <label className="mt-3 block text-xs font-medium">Location<input name="location" placeholder="e.g. Room 12" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>

                <div className="mt-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated">
                  <button type="button" onClick={() => setNewTeamOpen((open) => !open)} aria-expanded={newTeamOpen} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left">
                    <div><p className="text-xs font-semibold">Step 2 · Supervisors</p><p className="text-[0.65rem] text-muted-foreground">{newTeam.length ? `${newTeam.length} selected` : "Choose supervisors for this date"}</p></div>
                    <ChevronDown className={`size-4 text-muted-foreground transition-transform ${newTeamOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {newTeamOpen ? <div className="border-t border-border-subtle p-2"><div className="max-h-56 space-y-1 overflow-auto scolapro-scrollbar">{staffForNewSession.map((member) => <StaffChoice key={member.id} member={member} checked={newTeam.includes(member.id)} onToggle={() => setNewTeam((current) => toggleValue(current, member.id))} />)}{!staffForNewSession.length ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">No active staff are placed at this school on {formatDate(sessionDate)}.</p> : null}</div><p className="mt-1.5 px-1 text-[0.65rem] text-muted-foreground">Only active staff placed at the school on this detention date are shown. You can add more than one supervisor per date.</p></div> : null}
                </div>

                <Button type="submit" className="mt-4 w-full" loading={createPending} disabled={!newTeam.length}>
                  <CalendarDays className="size-4" aria-hidden="true" />
                  {createPending ? "Scheduling…" : "Schedule detention"}
                </Button>
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
                      <div><StepBadge number={2} label="Supervisors" /><p className="mt-1 text-sm font-semibold">{formatDate(selectedSession.sessionDate)}</p><p className="text-xs text-muted-foreground">{selectedSession.supervisorIds.length} supervisors rostered. Expand only when the team needs changing.</p></div>
                      <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${existingTeamOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    {existingTeamOpen ? <form action={teamAction} className="border-t border-border-subtle p-4"><input type="hidden" name="sessionId" value={selectedSession.id} />{editingTeam.map((id) => <input key={id} type="hidden" name="staffMemberIds" value={id} />)}<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{staffForSelectedSession.map((member) => <StaffChoice key={member.id} member={member} checked={editingTeam.includes(member.id)} onToggle={() => setEditingTeam((current) => toggleValue(current, member.id))} />)}</div><p className="mt-2 text-[0.65rem] text-muted-foreground">Only active staff placed at the school on {formatDate(selectedSession.sessionDate)} are available.</p><Button type="submit" variant="neutral" size="sm" className="mt-3" disabled={!editingTeam.length} loading={teamPending}>{teamPending ? "Saving team…" : "Save supervisors"}</Button></form> : null}
                  </div>

                  <form action={allocateAction} className="rounded-[var(--radius-md)] border border-border-subtle p-4">
                    <input type="hidden" name="sessionId" value={selectedSession.id} />
                    {selectedObligations.map((id) => <input key={id} type="hidden" name="obligationIds" value={id} />)}
                    <input type="hidden" name="supervisorStaffMemberId" value={allocationSupervisor} />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div><StepBadge number={3} label="Allocate learners" /><h3 className="mt-2 text-sm font-semibold">Allocate due detention obligations</h3><p className="mt-1 max-w-xl text-xs text-muted-foreground">Select an entire class group or individual obligations, then assign them to the supervisor who will run their detention.</p></div>
                      <div className="w-full sm:max-w-xs"><Picker ariaLabel="Allocate selected detention obligations to supervisor" value={allocationSupervisor} onChange={setAllocationSupervisor} placeholder="Choose supervisor" searchable searchPlaceholder="Search rostered supervisors" options={selectedSession.supervisorIds.map((id) => ({ value: id, label: staffById.get(id)?.name ?? "Supervisor", helper: staffById.get(id)?.employeeNumber ?? undefined }))} /></div>
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

                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <p className="text-xs text-muted-foreground">{selectedObligations.length} learner{selectedObligations.length === 1 ? "" : "s"} selected · {selectedSession.supervisorIds.length} rostered supervisor{selectedSession.supervisorIds.length === 1 ? "" : "s"}</p>
                      <div className="flex justify-end">
                        <Button type="submit" loading={allocatePending} disabled={!allocationSupervisor || !selectedObligations.length}>
                          <Users className="size-4" aria-hidden="true" />
                          {allocatePending ? "Assigning…" : "Assign to selected supervisor"}
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="grid min-h-72 place-items-center rounded-[var(--radius-md)] border border-dashed border-border p-6 text-center"><div><Users className="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><p className="mt-2 text-sm font-semibold">Plan a detention date first</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Once a session exists, choose its supervisors and allocate only the detention obligations due for that session.</p></div></div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
