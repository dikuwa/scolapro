import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { getDneaCandidateReadiness, getDneaReadinessScope } from "@/features/dnea-readiness/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DneaReadinessPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dnea/readiness");

  const scope = await getDneaReadinessScope();
  const { cycle } = await searchParams;
  const selected = cycle ? scope.find((row) => row.cycleId === cycle) ?? null : null;
  const candidates = selected?.accessScope === "school" ? await getDneaCandidateReadiness(selected.cycleId) : [];
  const totals = scope.reduce((acc, row) => ({ candidates: acc.candidates + row.candidateCount, blocking: acc.blocking + row.blockingCount, warnings: acc.warnings + row.warningCount }), { candidates: 0, blocking: 0, warnings: 0 });

  return <AppShell><section>
    <div className="mb-6"><h1 className="scolapro-page-title text-xl sm:text-2xl">DNEA candidate readiness</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Review candidate registration readiness and exceptions within your authorised school, circuit or regional scope. Network review is intentionally aggregate-only.</p></div>

    <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
      <Summary label="Candidates" value={totals.candidates} icon={<Users className="size-4" />} />
      <Summary label="Blocking exceptions" value={totals.blocking} icon={<AlertTriangle className="size-4" />} bordered />
      <Summary label="Warnings" value={totals.warnings} icon={<ShieldCheck className="size-4" />} bordered />
    </div>

    {scope.length === 0 ? <div className="mt-5 rounded-[var(--radius-md)] bg-surface p-6 text-center shadow-[var(--shadow-xs)]"><p className="text-sm font-medium">No DNEA readiness cycles are available</p><p className="mt-1 text-xs leading-5 text-muted-foreground">No examination cycle falls inside your current school or education-network scope.</p></div> : <div className="mt-5 overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Readiness by school and cycle</h2><p className="scolapro-section-description">Blocking and warning counts come from the existing examination readiness issue register.</p></div>
      <div className="divide-y divide-border-subtle">{scope.map((row) => <div key={row.cycleId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(5rem,.5fr))_auto] sm:items-center sm:px-5">
        <div><p className="text-sm font-semibold">{row.schoolName}</p><p className="mt-1 text-xs text-muted-foreground">{row.cycleName} · {row.academicYear} · {row.cycleKey}</p></div>
        <Metric label="Candidates" value={row.candidateCount} /><Metric label="Blocking" value={row.blockingCount} /><Metric label="Warnings" value={row.warningCount} />
        {row.accessScope === "school" ? <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/dnea/readiness?cycle=${row.cycleId}`}>Review candidates</Link> : <span className="text-xs text-muted-foreground" title="Candidate identity remains school-restricted">Network summary only</span>}
      </div>)}</div>
    </div>}

    {selected?.accessScope === "network" ? <div className="mt-5 rounded-[var(--radius-sm)] bg-surface-muted p-4"><p className="text-sm font-medium">Candidate detail is restricted</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Circuit and regional membership provides readiness exception visibility without opening learner identity, support records or candidate-level subject detail.</p></div> : null}

    {selected?.accessScope === "school" ? <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="border-b border-border-subtle pb-4"><h2 className="scolapro-section-title">{selected.cycleName} candidates</h2><p className="scolapro-section-description">Official candidate and subject codes are displayed exactly as stored; ScolaPro does not generate or infer DNEA identifiers.</p></div>
      {candidates.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No active candidates are registered for this cycle.</p> : <div className="divide-y divide-border-subtle">{candidates.map((candidate) => <article key={candidate.candidateId} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{candidate.learnerName}</p><p className="mt-1 text-xs text-muted-foreground">Candidate number: {candidate.candidateNumber ?? "Not assigned"} · {candidate.registrationStatus}</p></div><span className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs font-medium">{candidate.isReady ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{candidate.isReady ? "Ready" : "Needs review"}</span></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><div><p className="text-xs font-medium text-muted-foreground">Subjects ({candidate.subjectCount})</p><div className="mt-2 flex flex-wrap gap-2">{candidate.subjects.length ? candidate.subjects.map((subject) => <span key={subject.id} className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs">{subject.code}{subject.name ? ` · ${subject.name}` : ""}</span>) : <span className="text-xs text-muted-foreground">No active subjects registered.</span>}</div></div><div><p className="text-xs font-medium text-muted-foreground">Open exceptions</p><div className="mt-2 space-y-2">{candidate.issues.length ? candidate.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2"><p className="text-xs font-medium">{issue.code} · {issue.severity}</p><p className="mt-1 text-xs text-muted-foreground">{issue.message}</p></div>) : <span className="text-xs text-muted-foreground">No unresolved exceptions.</span>}</div></div></div>
      </article>)}</div>}
    </section> : null}
  </section></AppShell>;
}

function Summary({ label, value, icon, bordered = false }: { label: string; value: number; icon: React.ReactNode; bordered?: boolean }) { return <div className={`flex items-center justify-between gap-4 px-4 py-4 sm:px-5 ${bordered ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""}`}><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1.5 text-2xl font-semibold">{value}</p></div><span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-surface-muted">{icon}</span></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>; }
