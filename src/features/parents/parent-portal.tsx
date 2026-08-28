"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarCheck2, FileText, GraduationCap, Link2, School, Users } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { claimGuardianProfile, type ParentPortalActionState } from "@/features/parents/server/actions";
import type { ClaimableGuardianProfile, ParentChildSummary, ParentPublishedReport } from "@/features/parents/server/portal";

const initialState: ParentPortalActionState = {};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function numeric(value: unknown): string {
  return typeof value === "number" ? String(value) : "0";
}

export function ParentPortal({ familyChildren, reports, claimable }: { familyChildren: ParentChildSummary[]; reports: ParentPublishedReport[]; claimable: ClaimableGuardianProfile[] }) {
  const [state, claimAction, pending] = useActionState(claimGuardianProfile, initialState);
  const [selectedLearnerId, setSelectedLearnerId] = useState(familyChildren[0]?.learnerId ?? "");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const child = familyChildren.find((item) => item.learnerId === selectedLearnerId) ?? familyChildren[0] ?? null;
  const childReports = useMemo(
    () => reports.filter((report) => report.learnerId === child?.learnerId),
    [reports, child?.learnerId],
  );
  const latestReport = childReports[0] ?? null;
  const latestSnapshot = latestReport ? record(latestReport.dataSnapshot) : {};
  const attendance = record(latestSnapshot.attendance);
  const resultRows = Array.isArray(latestSnapshot.results) ? latestSnapshot.results : [];

  if (!familyChildren.length) {
    return <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
        <div className="flex items-start gap-3"><span className="scolapro-tone-brand grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Link2 className="size-4" /></span><div><h2 className="scolapro-section-title">Connect your guardian profile</h2><p className="scolapro-section-description">ScolaPro only offers profiles whose active guardian email exactly matches the email on your signed-in account.</p></div></div>
        {claimable.length ? <div className="mt-4 space-y-2">{claimable.map((profile) => <form key={profile.guardianId} action={claimAction} className="flex flex-col gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:flex-row sm:items-center sm:justify-between"><input type="hidden" name="guardianId" value={profile.guardianId} /><div><p className="text-sm font-semibold text-foreground">{profile.displayName}</p><p className="mt-0.5 text-xs text-muted-foreground">Verified exact-email guardian match</p></div><button disabled={pending} type="submit" className="scolapro-cta inline-flex min-h-9 items-center justify-center gap-2 bg-brand px-3 text-xs font-semibold text-white disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <BadgeCheck className="size-3.5" />}Link profile</button></form>)}</div> : <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-4 text-sm text-muted-foreground">No guardian profile currently matches this account email. Ask the school to confirm the guardian email recorded on the learner profile.</div>}
      </section>
    </div>;
  }

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="mb-4"><h2 className="scolapro-section-title">My children</h2><p className="scolapro-section-description">Switch between linked learners. Access comes from effective guardian relationships, not school-wide learner permissions.</p></div>
      <Picker label="Learner" name="learner" value={child?.learnerId ?? ""} onChange={setSelectedLearnerId} options={familyChildren.map((item) => ({ value: item.learnerId, label: item.name, helper: `${item.schoolName ?? "School"} · ${item.grade ?? "Grade"} · ${item.registerClass ?? "Class"}` }))} />
    </section>

    {child ? <>
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3 px-4 py-4"><div><p className="text-xs font-medium text-muted-foreground">School</p><p className="mt-1.5 text-sm font-semibold text-foreground">{child.schoolName ?? "Not available"}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><School className="size-4" /></span></div>
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Class</p><p className="mt-1.5 text-sm font-semibold text-foreground">{child.grade ?? "—"} · {child.registerClass ?? "—"}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><Users className="size-4" /></span></div>
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0"><div><p className="text-xs font-medium text-muted-foreground">Published reports</p><p className="mt-1.5 text-xl font-semibold text-[color:var(--accent-mint)]">{childReports.length}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><FileText className="size-4" /></span></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="scolapro-section-title">Latest published results</h2><p className="scolapro-section-description">Only school-published official report snapshots are shown.</p></div><GraduationCap className="size-5 text-brand" /></div>
          {resultRows.length ? <div className="divide-y divide-border-subtle">{resultRows.map((value, index) => { const row=record(value); return <div key={`${String(row.official_result_id ?? index)}`} className="flex items-center justify-between gap-3 py-2.5"><div><p className="text-sm font-medium text-foreground">{String(row.subject_name ?? "Subject")}</p><p className="text-[0.68rem] text-muted-foreground">{String(row.subject_code ?? "")}</p></div><div className="text-right"><p className="text-sm font-semibold text-foreground">{row.result_value !== null && row.result_value !== undefined ? String(row.result_value) : String(row.result_status ?? "—")}</p>{row.symbol ? <p className="text-[0.68rem] text-muted-foreground">{String(row.symbol)}</p> : null}</div></div>; })}</div> : <p className="text-sm text-muted-foreground">No published report results are available yet.</p>}
        </div>

        <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="scolapro-section-title">Attendance on latest report</h2><p className="scolapro-section-description">This is the attendance summary frozen into the published report snapshot.</p></div><CalendarCheck2 className="size-5 text-brand" /></div>
          {latestReport ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-[0.65rem] text-muted-foreground">Recorded days</p><p className="mt-1 text-lg font-semibold">{numeric(attendance.recorded_school_days)}</p></div><div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-[0.65rem] text-muted-foreground">Present</p><p className="mt-1 text-lg font-semibold">{numeric(attendance.present)}</p></div><div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-[0.65rem] text-muted-foreground">Absent</p><p className="mt-1 text-lg font-semibold">{numeric(attendance.absent)}</p></div><div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-[0.65rem] text-muted-foreground">Late</p><p className="mt-1 text-lg font-semibold">{numeric(attendance.late)}</p></div><div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-[0.65rem] text-muted-foreground">Excused</p><p className="mt-1 text-lg font-semibold">{numeric(attendance.excused)}</p></div></div> : <p className="text-sm text-muted-foreground">Attendance becomes available here when the school publishes a report card.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Published report history</h2><p className="scolapro-section-description">Historical published snapshots remain separate versions so later mark or rule changes never rewrite the report you received.</p></div>
        {childReports.length ? <div className="divide-y divide-border-subtle">{childReports.map((report) => <div key={report.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="text-sm font-semibold">Term {report.termNumber} · Version {report.snapshotVersion}</p><p className="mt-0.5 text-xs text-muted-foreground">Published {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString() : "by school"}</p></div><span className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--success)]"><BadgeCheck className="size-3.5" />Official published snapshot</span></div>)}</div> : <div className="px-4 py-8 text-center text-sm text-muted-foreground">No published reports yet.</div>}
      </section>
    </> : null}
  </div>;
}
