"use client";

import { BookOpenCheck, Check, History } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncIndividualLearnerSubjects } from "@/features/learners/server/subject-assignment-actions";
import type { LearnerSubjectWorkspaceData } from "@/features/learners/subject-assignment-types";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function LearnerSubjectWorkspace({ data }: { data: LearnerSubjectWorkspaceData }) {
  const router = useRouter();
  const initialActive = data.subjects.filter((subject) => subject.registrationStatus === "active").map((subject) => subject.id);
  const [selectedIds, setSelectedIds] = useState(initialActive);
  const [pending, startTransition] = useTransition();
  const changed = [...selectedIds].sort().join(",") !== [...initialActive].sort().join(",");

  function toggle(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function save() {
    startTransition(async () => {
      const result = await syncIndividualLearnerSubjects({ learnerId: data.learnerId, enrolmentId: data.enrolmentId, subjectOfferingIds: selectedIds });
      if (!result.success) { toast.error(result.message); return; }
      toast.success(result.message); router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3"><span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><BookOpenCheck className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Current subjects</h2><p className="scolapro-section-description !mt-0">{data.gradeLabel} · {data.registerClassLabel} · {data.academicYear}. Select the complete active set for this learner.</p></div></div>
        {data.subjects.length ? <div className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">{data.subjects.map((subject) => {
          const selected = selectedIds.includes(subject.id);
          const previouslyWithdrawn = subject.registrationStatus === "withdrawn";
          return <div key={subject.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="scolapro-record-title">{subject.subjectName}</h3><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">{subject.subjectCode}</span>{selected ? <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.68rem] font-semibold text-[color:var(--success)]">Current</span> : previouslyWithdrawn ? <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[0.68rem] font-semibold text-[color:var(--warning)]">Withdrawn</span> : <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">Not assigned</span>}</div>{previouslyWithdrawn ? <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><History className="size-3.5" aria-hidden="true" />Historical registration preserved{formatDate(subject.withdrawnAt) ? ` · withdrawn ${formatDate(subject.withdrawnAt)}` : ""}{subject.withdrawalReason ? ` · ${subject.withdrawalReason}` : ""}</p> : null}</div><Button size="sm" variant={selected ? "neutral" : "soft"} disabled={pending || subject.status !== "active"} onClick={() => toggle(subject.id)}>{selected ? "Withdraw" : previouslyWithdrawn ? "Reactivate" : "Add subject"}</Button></div>;
        })}</div> : <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No subjects configured for this grade</p><p className="mt-1 text-xs text-muted-foreground">Add active subject offerings in Academic Setup before assigning learner subjects.</p></div>}
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button loading={pending} disabled={!changed} onClick={save}><Check className="size-4" aria-hidden="true" />{pending ? "Saving…" : "Save subject changes"}</Button><p className="text-xs text-muted-foreground">Withdrawals preserve registration identity, marks and academic history.</p></div>
      </section>
    </div>
  );
}
