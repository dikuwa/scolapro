"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Search, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Picker } from "@/components/ui/picker";
import { CandidateNumberForm } from "@/features/examinations/candidate-number-form";
import type { ExaminationCandidate, ExaminationCycle } from "@/features/examinations/server/candidates";

export function CandidateWorkspace({ cycles, selectedCycleId, candidates }: { cycles: ExaminationCycle[]; selectedCycleId: string | null; candidates: ExaminationCandidate[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return candidates.filter((candidate) => !normalized || [candidate.learnerName, candidate.admissionNumber ?? "", candidate.candidateNumber ?? "", candidate.registerClass].some((value) => value.toLowerCase().includes(normalized)));
  }, [candidates, query]);
  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId);

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="grid gap-3 md:grid-cols-[minmax(14rem,0.45fr)_minmax(0,1fr)] md:items-end"><Picker label="Examination cycle" name="cycle" value={selectedCycleId ?? ""} onChange={(value) => router.push(`/statutory/examinations?cycle=${encodeURIComponent(value)}`)} placeholder="Choose cycle" options={cycles.map((cycle) => ({ value: cycle.id, label: `${cycle.name} · ${cycle.year}`, helper: `${cycle.authority} · ${cycle.status}` }))} /><div><label htmlFor="candidate-search" className="text-xs font-medium">Search candidates</label><div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input id="candidate-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Learner, admission or Candidate Number" className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated py-2 pl-9 pr-3 text-sm outline-none transition duration-[var(--motion-fast)] placeholder:text-muted-foreground focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]" /></div></div></div>
      {selectedCycle ? <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-[var(--radius-xs)] bg-brand-soft px-2.5 py-1.5 font-medium text-brand-strong">{selectedCycle.authority}</span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-muted-foreground">{selectedCycle.status}</span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-muted-foreground">{candidates.filter((candidate) => candidate.candidateNumber).length} of {candidates.length} assigned</span></div> : null}
    </section>

    <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]"><div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Candidate allocation</h2><p className="scolapro-section-description">Record only Candidate Numbers issued by DNEA or another official authority. ScolaPro does not generate these identifiers.</p></div>{!cycles.length ? <div className="px-4 py-10 text-center"><ShieldCheck className="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><p className="mt-2 text-sm font-medium">No examination cycles configured</p><p className="mt-1 text-xs text-muted-foreground">Create the governed cycle and candidate registrations before assigning official numbers.</p></div> : filtered.length ? <div className="divide-y divide-border-subtle">{filtered.map((candidate) => <article key={candidate.id} className="px-4 py-4 sm:px-5"><div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="scolapro-record-title">{candidate.learnerName}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.admissionNumber ?? "No admission number"} · {candidate.grade} · {candidate.registerClass}</p></div><div className="flex flex-wrap gap-1.5"><span className={`inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs font-medium ${candidate.identityVerified ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{candidate.identityVerified ? <BadgeCheck className="size-3.5" aria-hidden="true" /> : <AlertTriangle className="size-3.5" aria-hidden="true" />}{candidate.identityVerified ? "Identity verified" : "Identity not verified"}</span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs font-medium capitalize text-muted-foreground">{candidate.registrationStatus}</span></div></div><CandidateNumberForm candidate={candidate} />{candidate.assignedAt ? <p className="mt-2 text-[0.68rem] text-muted-foreground">Last assigned {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(candidate.assignedAt))}</p> : null}</article>)}</div> : <div className="px-4 py-10 text-center"><ShieldCheck className="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><p className="mt-2 text-sm font-medium">No candidates match this view</p><p className="mt-1 text-xs text-muted-foreground">Candidate registrations are created through the governed examination workflow.</p></div>}</section>
  </div>;
}

