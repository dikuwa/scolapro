"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, ChevronLeft, ChevronRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Picker } from "@/components/ui/picker";
import { approveOfficialResult, type OfficialResultApprovalRow, type OfficialResultApprovalWorkspace, type OfficialResultApprovalState } from "@/features/assessment/server/official-result-approval";

const initialState: OfficialResultApprovalState = { message: "" };

function ApprovalRow({ row, schemeId, termNumber, scaleId, verified, confirmed }: {
  row: OfficialResultApprovalRow;
  schemeId: string;
  termNumber: number;
  scaleId: string;
  verified: boolean;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(approveOfficialResult, initialState);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
    } else {
      toast.error(state.message);
    }
  }, [router, state]);

  // Already-official rows are not silently overwritten: the canonical RPC
  // accepts a reissue only with authorized corrected marks and re-verification.
  const allowed = row.registered && (!row.approved || row.replacementEligible) && verified && Boolean(scaleId) && confirmed;
  return <article className="grid gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p>
      <p className="mt-1.5 text-xs">
        {row.approved && !row.replacementEligible
          ? <span className="mt-1 block text-xs text-muted-foreground">Reapproval requires an authorized corrected mark and completed re-verification.</span>
          : null}
        {row.approved
          ? <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="size-3.5" />Official · {row.resultValue ?? "—"} {row.symbol ?? ""} · Correction reapproval requires governed evidence</span>
          : !row.registered ? <span className="text-warning">Not registered for this offering</span>
            : verified ? <span className="text-muted-foreground">Verified scheme · awaiting official approval</span>
              : <span className="text-warning">Required assessments not yet verified</span>}
      </p>
    </div>
    <form action={action}>
      <input type="hidden" name="schemeId" value={schemeId} />
      <input type="hidden" name="enrolmentId" value={row.enrolmentId} />
      <input type="hidden" name="termNumber" value={termNumber} />
      <input type="hidden" name="gradingScaleId" value={scaleId} />
      <input type="hidden" name="confirmed" value={confirmed ? "yes" : "no"} />
      <Button type="submit" size="sm" loading={pending} disabled={!allowed}>
        <LockKeyhole className="size-3.5" />
        {row.approved ? "Reapprove corrected" : "Approve result"}
      </Button>
    </form>
  </article>;
}

export function OfficialResultApprovalView({ workspace }: { workspace: OfficialResultApprovalWorkspace }) {
  const router = useRouter();
  const params = useSearchParams();
  const [scaleId, setScaleId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const selectedOffering = workspace.offerings.find((row) => row.value === workspace.offeringId);
  const schemeOptions = workspace.schemes.filter((row) => row.offeringId === workspace.offeringId);
  const classOptions = workspace.classes.filter((row) => row.gradeId === selectedOffering?.gradeId);
  const selectedScheme = workspace.schemes.find((row) => row.value === workspace.schemeId);
  const termOptions = (selectedScheme?.terms ?? [1, 2, 3]).filter((value) => value >= 1 && value <= 3)
    .map((value) => ({ value: String(value), label: `Term ${value}` }));

  function updateQuery(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    setConfirmed(false);
    router.push(`/assessment/results?${next.toString()}`);
  }

  function pageHref(page: number) {
    const next = new URLSearchParams(params.toString());
    if (page > 1) next.set("page", String(page));
    else next.delete("page");
    return `/assessment/results?${next.toString()}`;
  }

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <h2 className="scolapro-section-title">Governed official-result approval</h2>
          <p className="scolapro-section-description">Select an active school assessment scheme and a configured grading scale. Approval is final for this result version and locks verified marks. Corrections must follow the governed re-verification process. No grading rules are invented here.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Picker label="Subject and grade" value={workspace.offeringId} onChange={(value) => updateQuery({ offering: value, scheme: null, class: null })} options={workspace.offerings} placeholder="Choose subject" searchable />
        <Picker label="Assessment scheme" value={workspace.schemeId} onChange={(value) => updateQuery({ scheme: value })} options={schemeOptions} placeholder="Choose active scheme" disabled={!workspace.offeringId} />
        <Picker label="Register class" value={workspace.classId} onChange={(value) => updateQuery({ class: value })} options={classOptions} placeholder="Choose class" disabled={!workspace.offeringId} searchable />
        <Picker label="Term" value={String(workspace.termNumber)} onChange={(value) => updateQuery({ term: value })} options={termOptions} placeholder="Choose term" disabled={!workspace.schemeId} />
      </div>
    </section>

    {workspace.schemeId && workspace.classId ? <>
      <section className="grid gap-3 rounded-[var(--radius-md)] bg-surface-muted p-4 sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Required assessment instances</p><p className="mt-1 text-xl font-semibold">{workspace.required}</p></div>
        <div><p className="text-xs text-muted-foreground">Verified / locked</p><p className="mt-1 text-xl font-semibold">{workspace.verifiedRequired}/{workspace.required}</p></div>
        <div><p className="text-xs text-muted-foreground">Approval readiness</p><p className={`mt-1 text-sm font-semibold ${workspace.ready ? "text-success" : "text-warning"}`}>{workspace.ready ? "Verified — learner completeness checked on approval" : "Not ready for official approval"}</p></div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,24rem)_1fr] sm:items-end">
          <Picker label="Grading scale and version" value={scaleId} onChange={(value) => { setScaleId(value); setConfirmed(false); }} options={workspace.scales} placeholder="Select configured grading scale" searchable />
          <CheckboxField label="I confirm these verified results may become official and locked" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!scaleId || !workspace.ready} />
        </div>
        {!workspace.scales.length ? <p className="mt-3 text-xs text-warning">No active grading scale is configured for this school. <Link href="/assessment/grading-scales" className="font-semibold underline underline-offset-2">Configure school grading scales</Link> before approving results.</p> : null}
        <p className="mt-3 text-xs text-muted-foreground">The server independently checks scheme, learner, school, term, grading bands, completeness and correction authority. Approval never publishes a report card automatically.</p>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="scolapro-section-title">Learners</h2><p className="scolapro-section-description">Current class enrolments · {workspace.total} total · Page {workspace.page} of {workspace.pageCount}</p></div>
          <Link href="/reports/report-cards" className="text-xs font-semibold text-brand-strong">Open report cards</Link>
        </div>
        {workspace.rows.length ? <div className="grid gap-2">{workspace.rows.map((row) => <ApprovalRow key={row.enrolmentId} row={row} schemeId={workspace.schemeId} termNumber={workspace.termNumber} scaleId={scaleId} verified={workspace.ready} confirmed={confirmed} />)}</div>
          : <p className="rounded-[var(--radius-sm)] bg-surface-muted p-5 text-sm text-muted-foreground">No current learners in this class for the selected school year.</p>}
        {workspace.pageCount > 1 ? <div className="mt-4 flex items-center justify-end gap-2">
          <Link aria-disabled={workspace.page <= 1} href={pageHref(Math.max(1, workspace.page - 1))} className={`inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] px-3 text-xs font-medium ${workspace.page <= 1 ? "pointer-events-none opacity-40" : "bg-surface-muted"}`}><ChevronLeft className="size-4" />Previous</Link>
          <Link aria-disabled={workspace.page >= workspace.pageCount} href={pageHref(Math.min(workspace.pageCount, workspace.page + 1))} className={`inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-xs)] px-3 text-xs font-medium ${workspace.page >= workspace.pageCount ? "pointer-events-none opacity-40" : "bg-surface-muted"}`}>Next<ChevronRight className="size-4" /></Link>
        </div> : null}
      </section>
    </> : <section className="rounded-[var(--radius-md)] bg-surface-muted p-6 text-sm text-muted-foreground">Choose a subject, active assessment scheme and class to review verified marks and approve official results.</section>}
  </div>;
}
