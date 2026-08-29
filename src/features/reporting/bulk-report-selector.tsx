"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Building2, Search, School, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { generateReportCardsBulk, type ReportCardActionState } from "@/features/reporting/server/actions";
import type { ReportCardLearner } from "@/features/reporting/server/report-cards";
import { formatPersonName } from "@/lib/person-name";

const initialState: ReportCardActionState = {};
type Scope = "school" | "grade" | "class" | "learner";

export function BulkReportSelector({ learners, terms, snapshots }: {
  learners: ReportCardLearner[];
  terms: { termNumber: number; name: string }[];
  snapshots: { enrolmentId: string; termNumber: number; status: string }[];
}) {
  const [state, action, pending] = useActionState(generateReportCardsBulk, initialState);
  const [scope, setScope] = useState<Scope>("school");
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [learnerQuery, setLearnerQuery] = useState("");
  const [termNumber, setTermNumber] = useState(String(terms[0]?.termNumber ?? 1));

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  const grades = useMemo(() => [...new Set(learners.map((l) => l.grade))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [learners]);
  const classes = useMemo(() => [...new Set(learners.filter((l) => !selectedGrade || l.grade === selectedGrade).map((l) => l.registerClass))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [learners, selectedGrade]);
  const searchedLearners = useMemo(() => {
    const needle = learnerQuery.trim().toLocaleLowerCase();
    if (!needle) return learners.slice(0, 30);
    return learners.filter((learner) => `${learner.name} ${learner.grade} ${learner.registerClass}`.toLocaleLowerCase().includes(needle)).slice(0, 50);
  }, [learnerQuery, learners]);

  const filteredLearners = useMemo(() => {
    if (scope === "learner") return learners.filter((l) => l.enrolmentId === selectedLearnerId);
    if (scope === "class" && selectedClass) return learners.filter((l) => l.registerClass === selectedClass && (!selectedGrade || l.grade === selectedGrade));
    if (scope === "grade" && selectedGrade) return learners.filter((l) => l.grade === selectedGrade);
    if (scope === "school") return learners;
    return [];
  }, [learners, scope, selectedLearnerId, selectedClass, selectedGrade]);

  const snapshotMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const snapshot of snapshots) map.set(`${snapshot.enrolmentId}:${snapshot.termNumber}`, snapshot.status);
    return map;
  }, [snapshots]);

  const selectedCount = filteredLearners.length;
  const scopeOptions: { value: Scope; label: string; helper: string; icon: typeof School }[] = [
    { value: "school", label: "Whole school", helper: `${learners.length} learners`, icon: School },
    { value: "grade", label: "By grade", helper: "Select one grade", icon: Building2 },
    { value: "class", label: "By class", helper: "Select one register class", icon: UsersRound },
  ];

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="mb-4">
        <h2 className="scolapro-section-title">Prepare report cards for printing</h2>
        <p className="scolapro-section-description">Bulk school, grade and class runs are the primary workflow. Individual learner reports remain available as a secondary search.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {scopeOptions.map((option) => {
          const Icon = option.icon;
          const active = scope === option.value;
          return <button key={option.value} type="button" onClick={() => { setScope(option.value); if (option.value !== "class") setSelectedClass(""); if (option.value === "school") setSelectedGrade(""); }} className={`flex min-h-20 items-center gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition ${active ? "border-[color:var(--brand)]/35 bg-brand-soft text-brand-strong" : "border-border-subtle bg-surface-muted/45 hover:bg-surface-muted"}`}><span className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] ${active ? "bg-brand text-white" : "bg-surface text-muted-foreground"}`}><Icon className="size-4" /></span><span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{option.helper}</span></span></button>;
        })}
      </div>

      <form action={action} className="mt-4 space-y-4">
        {filteredLearners.map((learner) => <input key={learner.enrolmentId} type="hidden" name="enrolmentId" value={learner.enrolmentId} />)}
        <input type="hidden" name="termNumber" value={termNumber} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scope === "grade" || scope === "class" ? <Picker label="Grade" name="gradeFilter" value={selectedGrade} onChange={(value) => { setSelectedGrade(value); setSelectedClass(""); }} placeholder="Choose grade" options={grades.map((grade) => ({ value: grade, label: grade, helper: `${learners.filter((l) => l.grade === grade).length} learners` }))} /> : null}
          {scope === "class" ? <Picker label="Register class" name="classFilter" value={selectedClass} onChange={setSelectedClass} placeholder="Choose class" options={classes.map((registerClass) => ({ value: registerClass, label: registerClass, helper: `${learners.filter((l) => l.registerClass === registerClass && (!selectedGrade || l.grade === selectedGrade)).length} learners` }))} /> : null}
          <Picker label="Term" name="term-ui" value={termNumber} onChange={setTermNumber} placeholder="Choose term" options={terms.map((term) => ({ value: String(term.termNumber), label: term.name }))} />
          <div className="flex items-end"><button type="submit" disabled={pending || selectedCount === 0} className="scolapro-cta inline-flex min-h-10 w-full items-center justify-center gap-2 bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55">{pending ? <Spinner className="size-4 text-white" /> : null}{pending ? "Preparing…" : `Prepare ${selectedCount || ""} report card${selectedCount === 1 ? "" : "s"}`}</button></div>
        </div>
      </form>

      <div className="mt-5 border-t border-border-subtle pt-4">
        <button type="button" onClick={() => setScope(scope === "learner" ? "school" : "learner")} className="text-xs font-semibold text-brand-strong hover:underline">{scope === "learner" ? "Back to bulk report printing" : "Need one learner only? Search individual report"}</button>
        {scope === "learner" ? <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.6fr)]"><label className="scolapro-control-surface flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 text-muted-foreground" /><input value={learnerQuery} onChange={(event) => setLearnerQuery(event.target.value)} placeholder="Search learner by name, grade or class…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><Picker ariaLabel="Individual learner" name="individualLearner" value={selectedLearnerId} onChange={setSelectedLearnerId} placeholder="Choose learner" options={searchedLearners.map((learner) => ({ value: learner.enrolmentId, label: formatPersonName(learner.name), helper: `${learner.grade} · ${learner.registerClass}` }))} /></div> : null}
      </div>

      {selectedCount > 0 ? <div className="mt-4 overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><table className="w-full min-w-[30rem] border-collapse text-left text-xs"><thead className="bg-surface-muted"><tr><th className="px-3 py-2 font-medium">Learner</th><th className="px-3 py-2 font-medium">Grade</th><th className="px-3 py-2 font-medium">Class</th><th className="px-3 py-2 font-medium">Current status</th></tr></thead><tbody className="divide-y divide-border-subtle">{filteredLearners.slice(0, 50).map((learner) => { const status = snapshotMap.get(`${learner.enrolmentId}:${termNumber}`); return <tr key={learner.enrolmentId}><td className="px-3 py-2 font-medium">{formatPersonName(learner.name)}</td><td className="px-3 py-2 text-muted-foreground">{learner.grade}</td><td className="px-3 py-2 text-muted-foreground">{learner.registerClass}</td><td className="px-3 py-2">{status ? <span className={`rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.64rem] font-medium ${status === "published" ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{status}</span> : <span className="text-muted-foreground">Not generated</span>}</td></tr>; })}{selectedCount > 50 ? <tr><td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">…and {selectedCount - 50} more learners</td></tr> : null}</tbody></table></div> : null}
      {selectedCount > 0 ? <p className="mt-3 text-[0.68rem] text-muted-foreground">Only approved official results are included. Each learner receives an independent immutable snapshot before certification and printing.</p> : null}
    </section>
  );
}
