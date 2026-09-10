"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BookCopy, RotateCcw, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { bulkIssueLibraryResources, bulkReturnLibraryResources, type LibraryActionState } from "@/features/library/server/actions";
import type { LibraryClass, LibraryCopy, LibraryGrade, LibraryLearner, LibraryLoan, LibraryTitle } from "@/features/library/server/queries";

const initialState: LibraryActionState = {};
const returnConditions = ["new", "good", "fair", "poor", "damaged", "lost"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
function pretty(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function copyIdentity(copy: LibraryCopy) { return copy.barcode || copy.assetNumber || `Copy ${copy.id.slice(0, 8)}`; }

export function ClassOperations({ schoolId, today, grades, classes, learners, titles, copies, loans }: { schoolId: string; today: string; grades: LibraryGrade[]; classes: LibraryClass[]; learners: LibraryLearner[]; titles: LibraryTitle[]; copies: LibraryCopy[]; loans: LibraryLoan[] }) {
  const [gradeId, setGradeId] = useState("");
  const [classId, setClassId] = useState("");
  const [titleId, setTitleId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [pairing, setPairing] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [issueState, issueAction, issuePending] = useActionState(bulkIssueLibraryResources, initialState);
  const [returnState, returnAction, returnPending] = useActionState(bulkReturnLibraryResources, initialState);

  useEffect(() => { if (issueState.message) issueState.success ? toast.success(issueState.message) : toast.error(issueState.message); }, [issueState]);
  useEffect(() => { if (returnState.message) returnState.success ? toast.success(returnState.message) : toast.error(returnState.message); }, [returnState]);

  const latestGrades = useMemo(() => {
    const byCode = new Map<string, LibraryGrade>();
    for (const grade of [...grades].sort((a, b) => b.academicYear - a.academicYear)) if (!byCode.has(grade.code)) byCode.set(grade.code, grade);
    return [...byCode.values()];
  }, [grades]);
  const visibleClasses = useMemo(() => classes.filter((item) => !gradeId || item.gradeId === gradeId), [classes, gradeId]);
  const classLearners = useMemo(() => learners.filter((learner) => learner.classId === classId), [learners, classId]);
  const titleMap = useMemo(() => new Map(titles.map((title) => [title.id, title])), [titles]);
  const copyMap = useMemo(() => new Map(copies.map((copy) => [copy.id, copy])), [copies]);
  const availableCopies = useMemo(() => copies.filter((copy) => copy.titleId === titleId && copy.availability === "available"), [copies, titleId]);
  const activeLoans = useMemo(() => loans.filter((loan) => ["open", "overdue"].includes(loan.status)), [loans]);
  const classActiveLoans = useMemo(() => activeLoans.filter((loan) => loan.classId === classId && (!titleId || copyMap.get(loan.copyId)?.titleId === titleId)), [activeLoans, classId, titleId, copyMap]);
  const historyByLearner = useMemo(() => {
    const map = new Map<string, LibraryLoan[]>();
    for (const loan of loans) if (loan.borrowerType === "learner") map.set(loan.borrowerId, [...(map.get(loan.borrowerId) ?? []), loan]);
    return map;
  }, [loans]);
  const autoPairing = useMemo(() => {
    const alreadyHolding = new Set(classActiveLoans.map((loan) => loan.borrowerId));
    const eligible = classLearners.filter((learner) => !alreadyHolding.has(learner.id));
    return Object.fromEntries(eligible.map((learner, index) => [learner.id, availableCopies[index]?.id ?? ""]));
  }, [classLearners, classActiveLoans, availableCopies]);

  const issuePairs = classLearners.map((learner) => ({ learner_id: learner.id, copy_id: pairing[learner.id] ?? autoPairing[learner.id] ?? "" })).filter((pair) => pair.copy_id);
  const selectedCopyIds = issuePairs.map((pair) => pair.copy_id);
  const duplicateCopies = new Set(selectedCopyIds).size !== selectedCopyIds.length;
  const alreadyHoldingIds = new Set(classActiveLoans.map((loan) => loan.borrowerId));
  const issueCandidates = classLearners.filter((learner) => !alreadyHoldingIds.has(learner.id));
  const shortage = Math.max(0, issueCandidates.length - availableCopies.length);
  const returnItems = classActiveLoans.map((loan) => ({ loan_id: loan.id, condition: conditions[loan.id] || "good", notes: null }));

  const selectedGradeLearners = learners.filter((learner) => learner.gradeId === gradeId);
  const gradeTitleIds = new Set(titles.filter((title) => !gradeId || title.gradeId === gradeId).map((title) => title.id));
  const gradeStock = copies.filter((copy) => gradeTitleIds.has(copy.titleId));
  const gradeLearnerIds = new Set(selectedGradeLearners.map((learner) => learner.id));
  const gradeLoans = loans.filter((loan) => loan.borrowerType === "learner" && gradeLearnerIds.has(loan.borrowerId));
  const gradeActive = gradeLoans.filter((loan) => ["open", "overdue"].includes(loan.status));
  const gradeOverdue = gradeActive.filter((loan) => loan.status === "overdue" || Boolean(loan.dueOn && loan.dueOn < today));
  const gradeLost = gradeLoans.filter((loan) => loan.status === "lost");
  const damagedCopyIds = new Set(copies.filter((copy) => copy.condition === "damaged" || copy.availability === "repair").map((copy) => copy.id));
  const gradeDamaged = gradeLoans.filter((loan) => loan.returnedCondition === "damaged" || damagedCopyIds.has(loan.copyId));

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3"><UsersRound className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" /><div><h2 className="scolapro-section-title">Class borrowing view</h2><p className="scolapro-section-description">Filter by current Grade → Class and inspect active allocations separately from historical returns.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Picker label="Grade" value={gradeId} onChange={(value) => { setGradeId(value); setClassId(""); setPairing({}); setConditions({}); }} searchable options={[{ value: "", label: "All grades" }, ...latestGrades.map((grade) => ({ value: grade.id, label: grade.name, helper: grade.code }))]} placeholder="All grades" />
        <Picker label="Class" value={classId} onChange={(value) => { setClassId(value); setPairing({}); setConditions({}); }} searchable options={[{ value: "", label: "Choose class" }, ...visibleClasses.map((item) => ({ value: item.id, label: item.name, helper: item.code }))]} placeholder="Choose class" />
        <Picker label="Textbook / title" value={titleId} onChange={(value) => { setTitleId(value); setPairing({}); setConditions({}); }} searchable options={[{ value: "", label: "All titles" }, ...titles.filter((title) => title.status === "active" && (!gradeId || !title.gradeId || title.gradeId === gradeId)).map((title) => ({ value: title.id, label: title.title, helper: [title.subjectCode, title.gradeCode].filter(Boolean).join(" · ") }))]} placeholder="All titles" />
      </div>

      {gradeId ? <div className="mt-4 grid overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface sm:grid-cols-3 xl:grid-cols-6">
        {[{ label: "Learners", value: selectedGradeLearners.length }, { label: "Stock", value: gradeStock.length }, { label: "Issued", value: gradeActive.length }, { label: "Overdue", value: gradeOverdue.length }, { label: "Lost", value: gradeLost.length }, { label: "Damaged", value: gradeDamaged.length }].map((item, index) => <div key={item.label} className={`px-3 py-3 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""}`}><p className="text-[0.68rem] font-medium text-muted-foreground">{item.label}</p><p className="mt-1 text-lg font-semibold">{item.value}</p></div>)}
      </div> : null}
      {gradeId ? <p className="mt-2 text-[0.68rem] text-muted-foreground">No configured allocation requirement/booklist exists in the current model, so “required copies” and shortage totals are not fabricated.</p> : null}

      {classId ? <div className="mt-4 overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle"><table className="min-w-full text-left text-xs"><thead className="bg-surface-muted text-muted-foreground"><tr><th className="px-3 py-2.5 font-semibold">Learner</th><th className="px-3 py-2.5 font-semibold">Current allocation</th><th className="px-3 py-2.5 font-semibold">Overdue</th><th className="px-3 py-2.5 font-semibold">Returned / lost / damaged history</th></tr></thead><tbody className="divide-y divide-border-subtle">{classLearners.map((learner) => {
        const current = activeLoans.filter((loan) => loan.borrowerId === learner.id && (!titleId || copyMap.get(loan.copyId)?.titleId === titleId));
        const history = (historyByLearner.get(learner.id) ?? []).filter((loan) => !["open","overdue"].includes(loan.status) && (!titleId || copyMap.get(loan.copyId)?.titleId === titleId));
        return <tr key={learner.id}><td className="px-3 py-3 align-top"><p className="font-semibold text-foreground">{learner.name}</p><p className="mt-0.5 text-muted-foreground">{learner.admissionNumber ?? "No admission number"}</p></td><td className="px-3 py-3 align-top">{current.length ? current.map((loan) => { const copy = copyMap.get(loan.copyId); const title = copy ? titleMap.get(copy.titleId) : null; return <p key={loan.id}>{title?.title ?? "Resource"} · {copy ? copyIdentity(copy) : "copy"}</p>; }) : <span className="text-muted-foreground">{titleId ? "Missing / unallocated" : "No active allocation"}</span>}</td><td className="px-3 py-3 align-top">{current.some((loan) => loan.status === "overdue" || Boolean(loan.dueOn && loan.dueOn < today)) ? <span className="font-semibold text-[color:var(--warning)]">Overdue</span> : "—"}</td><td className="px-3 py-3 align-top text-muted-foreground">{history.length ? history.slice(0, 3).map((loan) => <p key={loan.id}>{pretty(loan.status)}{loan.returnedCondition ? ` · ${pretty(loan.returnedCondition)}` : ""}</p>) : "—"}</td></tr>;
      })}</tbody></table></div> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Choose a grade and class to review learner allocations.</div>}
    </section>

    {classId && titleId ? <section className="grid gap-5 xl:grid-cols-2">
      <form action={issueAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="pairsJson" value={JSON.stringify(issuePairs)} />
        <div><h2 className="scolapro-section-title">Bulk issue by class</h2><p className="scolapro-section-description">Automatic copy-to-learner pairing is previewed before the canonical issue lifecycle commits.</p></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><DateField label="Due date" name="dueOn" value={dueOn} onChange={setDueOn} min={today} /><label className="block text-xs font-medium leading-4">Issue note<input name="notes" placeholder="Optional note for this class issue" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label></div>
        <div className="mt-4 space-y-2">{issueCandidates.map((learner) => <div key={learner.id} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center"><div><p className="text-xs font-semibold">{learner.name}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{learner.admissionNumber ?? "Learner"}</p></div><Picker label="Assigned copy" value={pairing[learner.id] ?? autoPairing[learner.id] ?? ""} onChange={(copyId) => setPairing((current) => ({ ...current, [learner.id]: copyId }))} options={[{ value: "", label: "Leave unallocated" }, ...availableCopies.map((copy) => ({ value: copy.id, label: copyIdentity(copy), helper: copy.locationLabel ?? pretty(copy.condition) }))]} placeholder="Leave unallocated" /></div>)}</div>
        {shortage ? <p className="mt-3 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-xs text-[color:var(--warning)]">Shortage: {shortage} learner{shortage === 1 ? "" : "s"} cannot be automatically paired because only {availableCopies.length} copies are currently available.</p> : null}
        {duplicateCopies ? <p className="mt-3 text-xs font-medium text-[color:var(--danger)]">The same physical copy is selected more than once. Correct the pairing before confirming.</p> : null}
        <div className="mt-4 flex justify-start sm:justify-end"><Button type="submit" loading={issuePending} disabled={issuePending || duplicateCopies || !issuePairs.length}><BookCopy className="size-4" aria-hidden="true" />Confirm {issuePairs.length} issue{issuePairs.length === 1 ? "" : "s"}</Button></div>
      </form>

      <form action={returnAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="itemsJson" value={JSON.stringify(returnItems)} />
        <div><h2 className="scolapro-section-title">Bulk return</h2><p className="scolapro-section-description">Normal return is the default. Mark individual damaged/lost exceptions before one confirmation.</p></div>
        {classActiveLoans.length ? <div className="mt-4 space-y-2">{classActiveLoans.map((loan) => { const copy = copyMap.get(loan.copyId); return <div key={loan.id} className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center"><div><p className="text-xs font-semibold">{loan.borrowerName}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">{copy ? copyIdentity(copy) : "Tracked copy"}</p></div><Picker label="Return outcome" value={conditions[loan.id] ?? "good"} onChange={(condition) => setConditions((current) => ({ ...current, [loan.id]: condition }))} options={returnConditions} placeholder="Good" /></div>; })}</div> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No active issues for this class and title.</div>}
        <div className="mt-4 flex justify-start sm:justify-end"><Button type="submit" variant="neutral" loading={returnPending} disabled={returnPending || !returnItems.length}><RotateCcw className="size-4" aria-hidden="true" />Confirm {returnItems.length} return{returnItems.length === 1 ? "" : "s"}</Button></div>
      </form>
    </section> : null}
  </div>;
}
