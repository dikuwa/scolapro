"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CircleCheck, Clock3, MoreHorizontal, Paperclip, Save, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { submitDailyRegister, type DailyRegisterState } from "@/features/attendance/server/actions";
import type { AttendanceClassOption, AttendanceLearnerRow, AttendanceReasonOption } from "@/features/attendance/server/register";

const initialState: DailyRegisterState = {};
type AttendanceStatus = AttendanceLearnerRow["status"];
type SexFilter = "all" | "male" | "female";

const statuses = [
  { value: "present" as const, label: "Present", icon: Check },
  { value: "absent" as const, label: "Absent", icon: X },
  { value: "late" as const, label: "Late", icon: Clock3 },
  { value: "excused" as const, label: "Excused", icon: ShieldCheck },
];

function statusClass(status: AttendanceStatus, active: boolean) {
  if (!active) return "bg-surface-muted text-muted-foreground hover:bg-surface-subtle hover:text-foreground";
  if (status === "present") return "bg-success-soft text-[color:var(--success)] ring-1 ring-inset ring-[color:var(--success)]/20";
  if (status === "absent") return "bg-danger-soft text-[color:var(--danger)] ring-1 ring-inset ring-[color:var(--danger)]/20";
  if (status === "late") return "bg-warning-soft text-[color:var(--warning)] ring-1 ring-inset ring-[color:var(--warning)]/20";
  return "bg-info-soft text-[color:var(--info)] ring-1 ring-inset ring-[color:var(--info)]/20";
}

function schoolDayShift(date: string, direction: -1 | 1) {
  const current = new Date(`${date}T12:00:00`);
  do current.setDate(current.getDate() + direction); while (current.getDay() === 0 || current.getDay() === 6);
  return current.toISOString().slice(0, 10);
}

export function DailyRegister({ classes, selectedClassId, attendanceDate, learners, reasons, currentSubmissionId }: {
  classes: AttendanceClassOption[];
  selectedClassId: string | null;
  attendanceDate: string;
  learners: AttendanceLearnerRow[];
  reasons: AttendanceReasonOption[];
  currentSubmissionId: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitDailyRegister, initialState);
  const [navigationPending, startNavigation] = useTransition();
  const [rows, setRows] = useState(learners);
  const [query, setQuery] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("all");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [evidenceNames, setEvidenceNames] = useState<Record<string, string>>({});
  const [clientMutationId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [state, router]);

  useEffect(() => {
    router.prefetch(`/attendance?view=week&date=${attendanceDate}${selectedClassId ? `&class=${encodeURIComponent(selectedClassId)}` : ""}`);
    if (!selectedClassId) return;
    for (const direction of [-1, 1] as const) {
      const target = schoolDayShift(attendanceDate, direction);
      router.prefetch(`/attendance?class=${encodeURIComponent(selectedClassId)}&date=${target}`);
    }
  }, [attendanceDate, router, selectedClassId]);

  const exceptions = useMemo(() => rows.filter((row) => row.status !== "present").map((row) => ({ enrolment_id: row.enrolmentId, status: row.status, reason_id: row.reasonId, note: row.note })), [rows]);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const searchMatch = !needle || `${row.name} ${row.admissionNumber ?? ""}`.toLowerCase().includes(needle);
      const sexMatch = sexFilter === "all" || (row.sex ?? "").toLowerCase() === sexFilter;
      return searchMatch && sexMatch;
    });
  }, [query, rows, sexFilter]);

  const presentCount = rows.filter((row) => row.status === "present").length;
  const exceptionCount = rows.length - presentCount;
  const focusedRow = focusedId ? rows.find((row) => row.enrolmentId === focusedId) ?? null : null;

  function updateRow(enrolmentId: string, changes: Partial<AttendanceLearnerRow>) {
    setRows((current) => current.map((row) => row.enrolmentId === enrolmentId ? { ...row, ...changes } : row));
  }

  function setStatus(row: AttendanceLearnerRow, status: AttendanceStatus) {
    updateRow(row.enrolmentId, { status, reasonId: status === "present" ? null : row.reasonId, note: status === "present" ? null : row.note });
    if (status === "present") setFocusedId(null);
  }

  function moveDate(direction: -1 | 1) {
    const params = new URLSearchParams();
    if (selectedClassId) params.set("class", selectedClassId);
    params.set("date", schoolDayShift(attendanceDate, direction));
    startNavigation(() => router.replace(`/attendance?${params.toString()}`, { scroll: false }));
  }

  function chooseClass(classId: string) {
    startNavigation(() => router.replace(`/attendance?class=${encodeURIComponent(classId)}&date=${encodeURIComponent(attendanceDate)}`, { scroll: false }));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Picker label="Register class" name="register-class-ui" value={selectedClassId ?? ""} onChange={chooseClass} placeholder="Choose a class" options={classes.map((item) => ({ value: item.id, label: item.name, helper: item.grade }))} className="max-w-xl" />
          <div><p className="text-xs font-medium text-muted-foreground lg:text-right">Attendance date</p><div className="mt-1.5 flex items-center gap-1.5"><button type="button" disabled={navigationPending} onClick={() => moveDate(-1)} aria-label="Previous school day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronLeft className="size-4" /></button><div className="relative min-w-0 flex-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-center text-sm font-medium sm:min-w-40 sm:flex-none">{navigationPending ? <span className="absolute inset-0 grid place-items-center"><Spinner className="size-4 text-brand" /></span> : null}<span className={navigationPending ? "opacity-0" : ""}>{new Intl.DateTimeFormat("en-NA", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${attendanceDate}T12:00:00`))}</span></div><button type="button" disabled={navigationPending} onClick={() => moveDate(1)} aria-label="Next school day" className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground hover:bg-brand-soft hover:text-brand-strong disabled:opacity-50"><ChevronRight className="size-4" /></button></div></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-sm)]">
        <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="scolapro-section-title">Daily register</h2><p className="scolapro-section-description">Everyone starts present. Search a learner or mark only the exceptions.</p></div><div className="flex gap-2 text-xs"><span className="rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 font-medium text-[color:var(--success)]">{presentCount} present</span><span className="rounded-[var(--radius-xs)] bg-surface px-2.5 py-1.5 font-medium text-muted-foreground">{exceptionCount} exceptions</span></div></div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="scolapro-control-surface flex min-h-10 w-full max-w-md items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find learner by name or number…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center text-muted-foreground"><X className="size-3.5" /></button> : null}</label>
            <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-surface p-1 shadow-[var(--shadow-xs)]">{(["all", "male", "female"] as SexFilter[]).map((value) => <button key={value} type="button" onClick={() => setSexFilter(value)} className={`min-h-7 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem] font-medium ${sexFilter === value ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"}`}>{value === "all" ? "All" : value === "male" ? "Boys" : "Girls"}</button>)}</div>
          </div>
          <p className="mt-2 text-[0.68rem] text-muted-foreground">{visibleRows.length} of {rows.length} learners shown</p>
        </div>

        {!selectedClassId || !classes.length ? <div className="py-10 text-center"><p className="text-sm font-medium">No register classes configured</p></div> : !rows.length ? <div className="py-10 text-center"><p className="text-sm font-medium">No learners in this class</p></div> : (
          <form action={action}>
            <input type="hidden" name="registerClassId" value={selectedClassId} /><input type="hidden" name="attendanceDate" value={attendanceDate} /><input type="hidden" name="clientMutationId" value={clientMutationId} /><input type="hidden" name="replacesSubmissionId" value={currentSubmissionId ?? ""} /><input type="hidden" name="exceptions" value={JSON.stringify(exceptions)} />
            <div className="divide-y divide-border-subtle px-3 sm:px-5">
              {visibleRows.map((row) => {
                const focused = focusedId === row.enrolmentId;
                const isException = row.status !== "present";
                const currentStatus = statuses.find((status) => status.value === row.status) ?? statuses[0];
                const CurrentIcon = currentStatus.icon;
                return <div key={row.enrolmentId} className={`-mx-1 px-2 py-3 transition sm:-mx-2 ${focused ? "bg-brand-soft/45 ring-1 ring-inset ring-[color:var(--brand)]/15" : ""}`}>
                  <div className="flex items-center gap-3 sm:grid sm:grid-cols-[minmax(11rem,0.8fr)_minmax(18rem,1.2fr)] sm:gap-2 sm:items-center">
                    <button type="button" onClick={() => setFocusedId(row.enrolmentId)} className="min-w-0 flex-1 text-left sm:pointer-events-none"><p className="scolapro-record-title truncate">{row.name}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p></button>
                    <button type="button" onClick={() => setFocusedId(row.enrolmentId)} aria-label={`Edit attendance for ${row.name}`} className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-[0.68rem] font-semibold sm:hidden ${statusClass(row.status, true)}`}><CurrentIcon className="size-3.5" aria-hidden="true" strokeWidth={2.4} /><MoreHorizontal className="size-3.5" aria-hidden="true" /></button>
                    <div className="hidden flex-wrap gap-1 sm:flex">{statuses.map((status) => { const Icon = status.icon; const active = row.status === status.value; return <button key={status.value} type="button" onClick={() => { setStatus(row, status.value); if (status.value !== "present") setFocusedId(row.enrolmentId); }} className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-[var(--radius-xs)] px-2 text-[0.68rem] font-semibold transition ${statusClass(status.value, active)}`}>{active ? <Icon className="size-3" aria-hidden="true" strokeWidth={2.4} /> : null}<span>{status.label}</span></button>; })}</div>
                  </div>

                  {isException && focused ? <div className="mt-3 hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3 shadow-[var(--shadow-xs)] sm:block">
                    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">Editing {row.name}</p><p className="text-[0.68rem] text-muted-foreground">Add a reason, note or evidence if available.</p></div><button type="button" onClick={() => setFocusedId(null)} aria-label="Close attendance details" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-3.5" /></button></div>
                    <div className="grid gap-3 sm:grid-cols-2 sm:items-end"><Picker label="Reason" name={`reason-ui-${row.enrolmentId}`} value={row.reasonId ?? ""} onChange={(reasonId) => updateRow(row.enrolmentId, { reasonId: reasonId || null })} placeholder="No reason" options={[{ value: "", label: "No reason" }, ...reasons.map((reason) => ({ value: reason.id, label: reason.name, helper: reason.sensitive ? "Restricted detail" : undefined }))]} /><div><label htmlFor={`note-${row.enrolmentId}`} className="block text-xs font-medium">Note</label><input id={`note-${row.enrolmentId}`} value={row.note ?? ""} onChange={(event) => updateRow(row.enrolmentId, { note: event.target.value })} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none shadow-[var(--shadow-xs)] placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/50" /></div></div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><EvidenceControl row={row} evidenceNames={evidenceNames} setEvidenceNames={setEvidenceNames} /><button type="button" onClick={() => setFocusedId(null)} className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--success)]"><CircleCheck className="size-3.5" />Done</button></div>
                  </div> : null}
                </div>;
              })}
            </div>

            {focusedRow ? <div className="fixed inset-0 z-[140] flex items-end bg-[color:var(--foreground)]/12 backdrop-blur-[1px] sm:hidden" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setFocusedId(null); }}>
              <div role="dialog" aria-modal="true" aria-label={`Attendance for ${focusedRow.name}`} className="max-h-[88vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-border-subtle bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-md)]">
                <div className="flex items-start justify-between gap-3"><div><p className="scolapro-section-title">{focusedRow.name}</p><p className="scolapro-section-description">{new Intl.DateTimeFormat("en-NA", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${attendanceDate}T12:00:00`))}</p></div><button type="button" onClick={() => setFocusedId(null)} aria-label="Close attendance editor" className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted"><X className="size-4" /></button></div>
                <div className="mt-4 grid grid-cols-4 gap-1">{statuses.map((status) => { const Icon = status.icon; const active = focusedRow.status === status.value; return <button key={status.value} type="button" onClick={() => setStatus(focusedRow, status.value)} className={`inline-flex min-h-9 flex-col items-center justify-center gap-1 rounded-[var(--radius-xs)] px-1 text-[0.65rem] font-semibold ${statusClass(status.value, active)}`}><Icon className="size-3.5" aria-hidden="true" strokeWidth={2.4} />{status.label}</button>; })}</div>
                {focusedRow.status !== "present" ? <div className="mt-4 space-y-3"><Picker label="Reason" name={`mobile-reason-ui-${focusedRow.enrolmentId}`} value={focusedRow.reasonId ?? ""} onChange={(reasonId) => updateRow(focusedRow.enrolmentId, { reasonId: reasonId || null })} placeholder="No reason" options={[{ value: "", label: "No reason" }, ...reasons.map((reason) => ({ value: reason.id, label: reason.name, helper: reason.sensitive ? "Restricted detail" : undefined }))]} /><div><label htmlFor={`mobile-note-${focusedRow.enrolmentId}`} className="block text-xs font-medium">Note</label><input id={`mobile-note-${focusedRow.enrolmentId}`} value={focusedRow.note ?? ""} onChange={(event) => updateRow(focusedRow.enrolmentId, { note: event.target.value })} placeholder="Optional context" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs shadow-[var(--shadow-xs)] outline-none" /></div><EvidenceControl row={focusedRow} evidenceNames={evidenceNames} setEvidenceNames={setEvidenceNames} /></div> : null}
                <button type="button" onClick={() => setFocusedId(null)} className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-medium text-white"><CircleCheck className="size-4" />Done</button>
              </div>
            </div> : null}

            <div className="flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-[0.7rem] text-muted-foreground">{currentSubmissionId ? "Saving creates a new auditable revision." : "Confirm attendance for this class and date."}</p><button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-4 text-white" /> : <Save className="size-4" />}{pending ? "Saving…" : currentSubmissionId ? "Save revision" : "Confirm register"}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}

function EvidenceControl({ row, evidenceNames, setEvidenceNames }: { row: AttendanceLearnerRow; evidenceNames: Record<string, string>; setEvidenceNames: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  return <div className="min-w-0"><input id={`evidence-${row.enrolmentId}`} name={`evidence-${row.enrolmentId}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(event) => setEvidenceNames((current) => ({ ...current, [row.enrolmentId]: event.target.files?.[0]?.name ?? "" }))} /><label htmlFor={`evidence-${row.enrolmentId}`} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-3 text-[0.7rem] font-medium text-muted-foreground hover:text-foreground"><Paperclip className="size-3.5" />{evidenceNames[row.enrolmentId] ? "Change evidence" : "Photo / evidence"}</label>{evidenceNames[row.enrolmentId] ? <span className="ml-2 break-all text-[0.68rem] text-muted-foreground">{evidenceNames[row.enrolmentId]}</span> : null}</div>;
}