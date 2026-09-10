"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BookOpenText, Boxes, CircleAlert, History, Search, UsersRound, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CatalogManager } from "@/features/library/catalog-manager";
import { ClassOperations } from "@/features/library/class-operations";
import { LibraryImport } from "@/features/library/library-import";
import { issueLibraryResource, returnLibraryResource, type LibraryActionState } from "@/features/library/server/actions";
import type { LibraryBorrower, LibraryClass, LibraryCopy, LibraryGrade, LibraryLearner, LibraryLoan, LibrarySubject, LibraryTitle } from "@/features/library/server/queries";

const initialState: LibraryActionState = {};
const returnConditions = ["good", "new", "fair", "poor", "damaged", "lost"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
type View = "catalog" | "manage" | "class" | "circulation" | "import";

function pretty(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "No due date"; }
function copyIdentity(copy: LibraryCopy) { return copy.barcode || copy.assetNumber || `Copy ${copy.id.slice(0, 8)}`; }
function copyLabel(copy: LibraryCopy, title?: LibraryTitle) { return `${title ? `${title.title} · ` : ""}${copyIdentity(copy)}${copy.locationLabel ? ` · ${copy.locationLabel}` : ""}`; }

function ReturnLoanForm({ loan, title, copy }: { loan: LibraryLoan; title?: LibraryTitle; copy?: LibraryCopy }) {
  const [state, action, pending] = useActionState(returnLibraryResource, initialState);
  const [condition, setCondition] = useState(copy?.condition && returnConditions.some((item) => item.value === copy.condition) ? copy.condition : "good");
  useEffect(() => { if (state.message) state.success ? toast.success(state.message) : toast.error(state.message); }, [state]);
  return <form action={action} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted/55 p-3 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)_auto] sm:items-end">
    <input type="hidden" name="loanId" value={loan.id} />
    <Picker label="Return condition" name="returnedCondition" value={condition} onChange={setCondition} options={returnConditions} />
    <label className="block text-xs font-medium leading-4">Return note<input name="notes" placeholder="Optional note" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
    <Button type="submit" variant={condition === "lost" ? "danger" : "neutral"} loading={pending} disabled={pending}>{condition === "lost" ? "Mark lost" : condition === "damaged" ? "Return damaged" : "Return"}</Button>
    <p className="sm:col-span-3 text-[0.68rem] text-muted-foreground">{title?.title ?? "Resource"} · {copy ? copyLabel(copy) : "Tracked copy"}. Lost/damaged outcomes use the canonical return lifecycle.</p>
  </form>;
}

export function LibraryWorkspace({ schoolId, titles, copies, loans, borrowers, subjects, grades, classes, learners, today }: {
  schoolId: string;
  titles: LibraryTitle[];
  copies: LibraryCopy[];
  loans: LibraryLoan[];
  borrowers: LibraryBorrower[];
  subjects: LibrarySubject[];
  grades: LibraryGrade[];
  classes: LibraryClass[];
  learners: LibraryLearner[];
  today: string;
}) {
  const [view, setView] = useState<View>("catalog");
  const [query, setQuery] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("active");
  const [availability, setAvailability] = useState("");
  const titleMap = useMemo(() => new Map(titles.map((item) => [item.id, item])), [titles]);
  const latestGrades = useMemo(() => { const map = new Map<string, LibraryGrade>(); for (const grade of [...grades].sort((a, b) => b.academicYear - a.academicYear)) if (!map.has(grade.code)) map.set(grade.code, grade); return [...map.values()]; }, [grades]);
  const normalized = query.trim().toLocaleLowerCase();

  const filteredTitles = useMemo(() => titles.filter((title) => {
    if (catalogStatus && title.status !== catalogStatus) return false;
    if (subjectId && title.subjectId !== subjectId) return false;
    if (gradeId && title.gradeId !== gradeId) return false;
    if (availability && !copies.some((copy) => copy.titleId === title.id && copy.availability === availability)) return false;
    if (!normalized) return true;
    return [title.title, title.author, title.publisher, title.isbn, title.subjectCode, title.gradeCode, title.edition, title.category].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized);
  }), [titles, copies, catalogStatus, subjectId, gradeId, availability, normalized]);

  const availableByTitle = useMemo(() => {
    const counts = new Map<string, { total: number; available: number; issued: number; repair: number; lost: number }>();
    for (const copy of copies) {
      const current = counts.get(copy.titleId) ?? { total: 0, available: 0, issued: 0, repair: 0, lost: 0 };
      current.total += 1;
      if (copy.availability === "available") current.available += 1;
      if (copy.availability === "on_loan") current.issued += 1;
      if (copy.availability === "repair") current.repair += 1;
      if (copy.availability === "lost") current.lost += 1;
      counts.set(copy.titleId, current);
    }
    return counts;
  }, [copies]);

  const tabs: { value: View; label: string; icon: typeof Boxes }[] = [
    { value: "catalog", label: "Catalog & stock", icon: Boxes },
    { value: "manage", label: "Manage catalog", icon: BookOpenText },
    { value: "class", label: "Class allocation", icon: UsersRound },
    { value: "circulation", label: "Circulation", icon: History },
    { value: "import", label: "Bulk import", icon: Upload },
  ];

  return <div className="space-y-5">
    <nav className="flex gap-1 overflow-x-auto rounded-[var(--radius-sm)] bg-surface-muted p-1" aria-label="Library workspace views">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.value} type="button" onClick={() => setView(tab.value)} className={`scolapro-cta flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-xs font-medium outline-none transition focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] ${view === tab.value ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`} aria-current={view === tab.value ? "page" : undefined}><Icon className="size-3.5" aria-hidden="true" />{tab.label}</button>; })}</nav>

    {view === "catalog" ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div><h2 className="scolapro-section-title">Catalog & physical stock</h2><p className="scolapro-section-description">Canonical configured subjects remain filterable even when the catalog contains no titles.</p></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="block text-xs font-medium leading-4 sm:col-span-2 xl:col-span-1">Search catalog<span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, ISBN, author…" className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-sm outline-none transition focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></span></label>
        <Picker label="Subject" value={subjectId} onChange={setSubjectId} searchable options={[{ value: "", label: "All subjects" }, ...subjects.filter((subject) => subject.status === "active").map((subject) => ({ value: subject.id, label: subject.name, helper: subject.code }))]} />
        <Picker label="Grade" value={gradeId} onChange={setGradeId} searchable options={[{ value: "", label: "All grades" }, ...latestGrades.map((grade) => ({ value: grade.id, label: grade.name, helper: grade.code }))]} />
        <Picker label="Title status" value={catalogStatus} onChange={setCatalogStatus} options={[{ value: "", label: "All title states" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }]} />
        <Picker label="Copy availability" value={availability} onChange={setAvailability} options={[{ value: "", label: "All stock states" }, ...["available", "on_loan", "reserved", "repair", "lost", "withdrawn"].map((value) => ({ value, label: pretty(value) }))]} />
      </div>
      {filteredTitles.length ? <div className="mt-4 divide-y divide-border-subtle">{filteredTitles.map((title) => {
        const counts = availableByTitle.get(title.id) ?? { total: 0, available: 0, issued: 0, repair: 0, lost: 0 };
        const titleCopies = copies.filter((copy) => copy.titleId === title.id);
        return <article key={title.id} className="py-4 first:pt-1"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="scolapro-record-title">{title.title}</p><p className="mt-1 text-xs text-muted-foreground">{[title.author, title.publisher, title.edition, title.subjectCode, title.gradeCode, pretty(title.resourceType)].filter(Boolean).join(" · ")}</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 font-semibold text-[color:var(--success)]">{counts.available} available</span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-muted-foreground">{counts.issued} issued</span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-muted-foreground">{counts.total} total</span></div></div>
          {titleCopies.length ? <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-2 pr-4 font-medium">Copy</th><th className="py-2 pr-4 font-medium">Location</th><th className="py-2 pr-4 font-medium">Condition</th><th className="py-2 font-medium">Availability</th></tr></thead><tbody>{titleCopies.map((copy) => <tr key={copy.id} className="border-t border-border-subtle"><td className="py-2.5 pr-4">{copyIdentity(copy)}</td><td className="py-2.5 pr-4 text-muted-foreground">{copy.locationLabel ?? "—"}</td><td className="py-2.5 pr-4">{pretty(copy.condition)}</td><td className="py-2.5">{pretty(copy.availability)}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-xs text-muted-foreground">No physical copies recorded.</p>}
        </article>;
      })}</div> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center"><CircleAlert className="mx-auto size-5 text-muted-foreground" aria-hidden="true" /><p className="mt-2 text-sm font-medium">No catalog titles match these filters</p><p className="mt-1 text-xs text-muted-foreground">Configured subjects are still available above. Use Manage catalog or Bulk import to add the first resource.</p></div>}
    </section> : null}

    {view === "manage" ? <CatalogManager schoolId={schoolId} titles={titles} subjects={subjects} grades={grades} /> : null}
    {view === "class" ? <ClassOperations schoolId={schoolId} today={today} grades={grades} classes={classes} learners={learners} titles={titles} copies={copies} loans={loans} /> : null}
    {view === "circulation" ? <Circulation today={today} titles={titles} copies={copies} loans={loans} borrowers={borrowers} grades={latestGrades} classes={classes} /> : null}
    {view === "import" ? <LibraryImport schoolId={schoolId} titles={titles} subjects={subjects} grades={grades} existingBarcodes={copies.map((copy) => copy.barcode).filter((value): value is string => Boolean(value))} existingAssets={copies.map((copy) => copy.assetNumber).filter((value): value is string => Boolean(value))} /> : null}
  </div>;
}

function Circulation({ today, titles, copies, loans, borrowers, grades, classes }: { today: string; titles: LibraryTitle[]; copies: LibraryCopy[]; loans: LibraryLoan[]; borrowers: LibraryBorrower[]; grades: LibraryGrade[]; classes: LibraryClass[] }) {
  const [issueState, issueAction, issuePending] = useActionState(issueLibraryResource, initialState);
  const [copyId, setCopyId] = useState("");
  const [borrowerType, setBorrowerType] = useState<"learner" | "staff">("learner");
  const [borrowerId, setBorrowerId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [classId, setClassId] = useState("");
  const [titleId, setTitleId] = useState("");
  const [status, setStatus] = useState("active");
  useEffect(() => { if (issueState.message) issueState.success ? toast.success(issueState.message) : toast.error(issueState.message); }, [issueState]);
  const titleMap = useMemo(() => new Map(titles.map((item) => [item.id, item])), [titles]);
  const copyMap = useMemo(() => new Map(copies.map((item) => [item.id, item])), [copies]);
  const availableCopies = copies.filter((copy) => copy.availability === "available" && titleMap.get(copy.titleId)?.status === "active");
  const borrowerOptions = borrowers.filter((borrower) => borrower.type === borrowerType);
  const visibleClasses = classes.filter((item) => !gradeId || item.gradeId === gradeId);
  const filteredLoans = loans.filter((loan) => {
    if (borrowerType && loan.borrowerType !== borrowerType) return false;
    if (gradeId && loan.gradeId !== gradeId) return false;
    if (classId && loan.classId !== classId) return false;
    if (titleId && copyMap.get(loan.copyId)?.titleId !== titleId) return false;
    if (status === "active" && !["open", "overdue"].includes(loan.status)) return false;
    if (status !== "" && status !== "active" && loan.status !== status) return false;
    return true;
  });
  const activeLoans = filteredLoans.filter((loan) => ["open", "overdue"].includes(loan.status));
  const historical = filteredLoans.filter((loan) => !["open", "overdue"].includes(loan.status));
  const overdue = activeLoans.filter((loan) => loan.status === "overdue" || Boolean(loan.dueOn && loan.dueOn < today));

  return <div className="space-y-5">
    <section className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <form action={issueAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><h2 className="scolapro-section-title">Issue one resource</h2><p className="scolapro-section-description">Single-person issue remains available alongside class bulk allocation.</p><div className="mt-4 space-y-3"><Picker label="Available copy" name="copyId" value={copyId} onChange={setCopyId} searchable options={availableCopies.map((copy) => ({ value: copy.id, label: titleMap.get(copy.titleId)?.title ?? "Resource", helper: `${copyLabel(copy)} · ${pretty(copy.condition)}` }))} placeholder={availableCopies.length ? "Choose copy" : "No copies available"} /><Picker label="Borrower type" name="borrowerType" value={borrowerType} onChange={(value) => { setBorrowerType(value as "learner" | "staff"); setBorrowerId(""); }} options={[{ value: "learner", label: "Learner" }, { value: "staff", label: "Staff member" }]} /><SearchableSelect label="Borrower" name="borrowerId" value={borrowerId} onChange={setBorrowerId} placeholder={`Choose ${borrowerType}`} searchPlaceholder={`Search ${borrowerType}s…`} emptyMessage={() => `No eligible ${borrowerType} found.`} options={borrowerOptions.map((borrower) => ({ value: borrower.id, label: borrower.name, helper: borrower.helper }))} /><DateField label="Due date" name="dueOn" value={dueOn} onChange={setDueOn} min={today} /><label className="block text-xs font-medium leading-4">Issue note<textarea name="notes" rows={3} className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 text-sm outline-none transition focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label><Button type="submit" className="w-full" loading={issuePending} disabled={issuePending || !copyId || !borrowerId}><BookOpenText className="size-4" aria-hidden="true" />Issue resource</Button></div></form>
      <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><h2 className="scolapro-section-title">Circulation filters</h2><p className="scolapro-section-description">Review loans by grade, class, borrower type, title and circulation state.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Picker label="Borrower type" value={borrowerType} onChange={(value) => setBorrowerType(value as "learner" | "staff")} options={[{ value: "learner", label: "Learner" }, { value: "staff", label: "Staff member" }]} /><Picker label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "All statuses" }, { value: "active", label: "Active / overdue" }, { value: "returned", label: "Returned" }, { value: "lost", label: "Lost" }, { value: "waived", label: "Waived" }]} /><Picker label="Grade" value={gradeId} onChange={(value) => { setGradeId(value); setClassId(""); }} options={[{ value: "", label: "All grades" }, ...grades.map((grade) => ({ value: grade.id, label: grade.name, helper: grade.code }))]} disabled={borrowerType === "staff"} /><Picker label="Class" value={classId} onChange={setClassId} options={[{ value: "", label: "All classes" }, ...visibleClasses.map((item) => ({ value: item.id, label: item.name }))]} disabled={borrowerType === "staff"} /><div className="sm:col-span-2"><Picker label="Resource / title" value={titleId} onChange={setTitleId} searchable options={[{ value: "", label: "All titles" }, ...titles.map((title) => ({ value: title.id, label: title.title, helper: [title.subjectCode, title.gradeCode].filter(Boolean).join(" · ") }))]} /></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-[var(--radius-sm)] bg-surface-muted p-3"><p className="text-[0.68rem] text-muted-foreground">Matching active</p><p className="mt-1 text-xl font-semibold">{activeLoans.length}</p></div><div className="rounded-[var(--radius-sm)] bg-warning-soft p-3"><p className="text-[0.68rem] text-[color:var(--warning)]">Matching overdue</p><p className="mt-1 text-xl font-semibold text-[color:var(--warning)]">{overdue.length}</p></div></div></div>
    </section>
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div><h2 className="scolapro-section-title">Matching circulation records</h2><p className="scolapro-section-description">Active loans can be returned individually; historical returned/lost items remain separate from active allocations.</p></div>{activeLoans.length ? <div className="mt-4 space-y-3">{activeLoans.map((loan) => { const copy = copyMap.get(loan.copyId); const title = copy ? titleMap.get(copy.titleId) : undefined; const isOverdue = loan.status === "overdue" || Boolean(loan.dueOn && loan.dueOn < today); return <article key={loan.id} className="rounded-[var(--radius-sm)] border border-border-subtle p-3.5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="scolapro-record-title">{title?.title ?? "Resource"}</p><p className="mt-1 text-xs text-muted-foreground">{loan.borrowerName} · {pretty(loan.borrowerType)} · issued {formatDate(loan.issuedOn)}</p></div><span className={isOverdue ? "rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]" : "rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--success)]"}>{isOverdue ? `Overdue · ${formatDate(loan.dueOn)}` : loan.dueOn ? `Due ${formatDate(loan.dueOn)}` : "Open"}</span></div><ReturnLoanForm loan={loan} title={title} copy={copy} /></article>; })}</div> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No active loans match these filters.</div>}
      {historical.length ? <div className="mt-5 border-t border-border-subtle pt-4"><div className="flex items-center gap-2"><History className="size-4 text-muted-foreground" aria-hidden="true" /><h3 className="text-sm font-semibold">Historical matches</h3></div><div className="mt-2 divide-y divide-border-subtle">{historical.slice(0, 50).map((loan) => { const copy = copyMap.get(loan.copyId); const title = copy ? titleMap.get(copy.titleId) : undefined; return <div key={loan.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">{title?.title ?? "Resource"}</p><p className="text-[0.68rem] text-muted-foreground">{loan.borrowerName} · {copy ? copyIdentity(copy) : "copy"}</p></div><span className="text-xs text-muted-foreground">{pretty(loan.status)}{loan.returnedOn ? ` · ${formatDate(loan.returnedOn)}` : ""}</span></div>; })}</div></div> : null}
    </section>
  </div>;
}
