"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { generateReportCard, type ReportCardActionState } from "@/features/reporting/server/actions";
import type { ReportCardLearner } from "@/features/reporting/server/report-cards";

const initialState: ReportCardActionState = {};

export function BulkReportSelector({ learners, terms, snapshots }: {
  learners: ReportCardLearner[];
  terms: { termNumber: number; name: string }[];
  snapshots: { enrolmentId: string; termNumber: number; status: string }[];
}) {
  const [state, _action, _pending] = useActionState(generateReportCard, initialState);
  const [scope, setScope] = useState("learner");
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedLearnerId, setSelectedLearnerId] = useState(learners[0]?.enrolmentId ?? "");
  const [termNumber, setTermNumber] = useState(String(terms[0]?.termNumber ?? 1));

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  // Derive grade/class options
  const grades = useMemo(() => [...new Set(learners.map((l) => l.grade))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [learners]);
  const classes = useMemo(() => {
    const source = scope === "grade" && selectedGrade
      ? learners.filter((l) => l.grade === selectedGrade)
      : learners;
    return [...new Set(source.map((l) => l.registerClass))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [learners, scope, selectedGrade]);

  // Filtered learners based on scope
  const filteredLearners = useMemo(() => {
    if (scope === "learner") return learners.filter((l) => l.enrolmentId === selectedLearnerId);
    if (scope === "class" && selectedClass) return learners.filter((l) => l.registerClass === selectedClass);
    if (scope === "grade" && selectedGrade) return learners.filter((l) => l.grade === selectedGrade);
    return learners; // whole school
  }, [learners, scope, selectedLearnerId, selectedClass, selectedGrade]);

  const snapshotMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of snapshots) map.set(`${s.enrolmentId}:${s.termNumber}`, s.status);
    return map;
  }, [snapshots]);

  const selectedCount = filteredLearners.length;
  const termKey = termNumber;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="mb-4">
        <h2 className="scolapro-section-title">Bulk report generation</h2>
        <p className="scolapro-section-description">Select a scope and term to generate report card snapshots. Each learner receives an independent immutable snapshot.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-4 lg:items-end">
        <Picker label="Scope" name="scope" value={scope} onChange={setScope} placeholder="Choose scope"
          options={[
            { value: "learner", label: "Single learner" },
            { value: "class", label: "By class" },
            { value: "grade", label: "By grade" },
            { value: "school", label: "Whole school" },
          ]} />

        {scope === "learner" ? (
          <Picker label="Learner" name="enrolmentId" value={selectedLearnerId} onChange={setSelectedLearnerId} placeholder="Choose learner"
            options={learners.map((l) => ({ value: l.enrolmentId, label: l.name, helper: `${l.grade} · ${l.registerClass}` }))} />
        ) : scope === "class" ? (
          <Picker label="Class" name="classFilter" value={selectedClass} onChange={setSelectedClass} placeholder="Choose class"
            options={classes.map((c) => ({ value: c, label: c, helper: `${learners.filter((l) => l.registerClass === c).length} learners` }))} />
        ) : scope === "grade" ? (
          <Picker label="Grade" name="gradeFilter" value={selectedGrade} onChange={setSelectedGrade} placeholder="Choose grade"
            options={grades.map((g) => ({ value: g, label: g, helper: `${learners.filter((l) => l.grade === g).length} learners` }))} />
        ) : null}

        <Picker label="Term" name="termNumber" value={termNumber} onChange={setTermNumber} placeholder="Choose term"
          options={terms.map((t) => ({ value: String(t.termNumber), label: t.name }))} />

        <div className="flex items-end gap-2">
          <span className="min-h-10 flex items-center text-xs text-muted-foreground">
            {selectedCount} learner{selectedCount === 1 ? "" : "s"} · Term {termKey}
          </span>
        </div>
      </div>

      {/* Preview table */}
      {selectedCount > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle">
          <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Learner</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Current status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredLearners.slice(0, 50).map((learner) => {
                const status = snapshotMap.get(`${learner.enrolmentId}:${termKey}`);
                return (
                  <tr key={learner.enrolmentId}>
                    <td className="px-3 py-2 font-medium">{learner.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{learner.grade}</td>
                    <td className="px-3 py-2 text-muted-foreground">{learner.registerClass}</td>
                    <td className="px-3 py-2">
                      {status ? (
                        <span className={`rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.64rem] font-medium ${status === "published" ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>
                          {status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not generated</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {selectedCount > 50 ? (
                <tr><td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">…and {selectedCount - 50} more learners</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <p className="mt-3 text-[0.68rem] text-muted-foreground">
          Only approved official results are included. Generation creates new immutable snapshots rather than rewriting history.
        </p>
      ) : null}
    </section>
  );
}
