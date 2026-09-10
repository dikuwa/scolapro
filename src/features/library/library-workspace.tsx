"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BookOpenText, CheckCircle2, CircleAlert, History, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { issueLibraryResource, returnLibraryResource, type LibraryActionState } from "@/features/library/server/actions";
import type { LibraryBorrower, LibraryCopy, LibraryLoan, LibraryTitle } from "@/features/library/server/queries";

const initialState: LibraryActionState = {};
const returnConditions = [
  { value: "good", label: "Good" },
  { value: "new", label: "New" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
];

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function copyLabel(copy: LibraryCopy, title?: LibraryTitle) {
  const identity = copy.barcode || copy.assetNumber || `Copy ${copy.id.slice(0, 8)}`;
  return title ? `${title.title} · ${identity}` : identity;
}

function ReturnLoanForm({ loan, title, copy }: { loan: LibraryLoan; title?: LibraryTitle; copy?: LibraryCopy }) {
  const [state, action, pending] = useActionState(returnLibraryResource, initialState);
  const [condition, setCondition] = useState(copy?.condition && returnConditions.some((item) => item.value === copy.condition) ? copy.condition : "good");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted/55 p-3 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="loanId" value={loan.id} />
      <Picker label="Return condition" name="returnedCondition" value={condition} onChange={setCondition} placeholder="Condition" options={returnConditions} />
      <label className="block text-xs font-medium leading-4">Return note
        <input name="notes" placeholder="Optional note" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
      </label>
      <Button type="submit" variant={condition === "lost" ? "danger" : "neutral"} loading={pending} disabled={pending}>
        {pending ? "Saving…" : condition === "lost" ? "Mark lost" : condition === "damaged" ? "Return damaged" : "Return"}
      </Button>
      <p className="sm:col-span-3 text-[0.68rem] text-muted-foreground">{title?.title ?? "Resource"} · {copy ? copyLabel(copy) : "Tracked copy"}. Lost and damaged outcomes use the canonical return lifecycle.</p>
    </form>
  );
}

export function LibraryWorkspace({ titles, copies, loans, borrowers, today }: { titles: LibraryTitle[]; copies: LibraryCopy[]; loans: LibraryLoan[]; borrowers: LibraryBorrower[]; today: string }) {
  const [issueState, issueAction, issuePending] = useActionState(issueLibraryResource, initialState);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [copyId, setCopyId] = useState("");
  const [borrowerType, setBorrowerType] = useState<"learner" | "staff">("learner");
  const [borrowerId, setBorrowerId] = useState("");
  const [dueOn, setDueOn] = useState("");

  useEffect(() => {
    if (!issueState.message) return;
    if (issueState.success) toast.success(issueState.message);
    else toast.error(issueState.message);
  }, [issueState]);

  const titleMap = useMemo(() => new Map(titles.map((item) => [item.id, item])), [titles]);
  const copyMap = useMemo(() => new Map(copies.map((item) => [item.id, item])), [copies]);
  const subjects = useMemo(() => [...new Set(titles.map((item) => item.subjectCode).filter((value): value is string => Boolean(value)))].sort(), [titles]);
  const normalized = query.trim().toLocaleLowerCase();
  const filteredTitles = useMemo(() => titles.filter((title) => {
    if (subject && title.subjectCode !== subject) return false;
    if (!normalized) return true;
    return [title.title, title.author, title.publisher, title.isbn, title.subjectCode, title.gradeCode, title.edition, title.category]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized);
  }), [titles, subject, normalized]);

  const availableCopies = useMemo(() => copies.filter((copy) => copy.availability === "available" && titleMap.get(copy.titleId)?.status === "active"), [copies, titleMap]);
  const activeLoans = useMemo(() => loans.filter((loan) => loan.status === "open" || loan.status === "overdue"), [loans]);
  const overdueLoans = useMemo(() => activeLoans.filter((loan) => loan.status === "overdue" || Boolean(loan.dueOn && loan.dueOn < today)), [activeLoans, today]);
  const history = useMemo(() => loans.filter((loan) => !["open", "overdue"].includes(loan.status)).slice(0, 25), [loans]);
  const borrowerOptions = borrowers.filter((borrower) => borrower.type === borrowerType);

  const availableByTitle = useMemo(() => {
    const counts = new Map<string, { total: number; available: number }>();
    for (const copy of copies) {
      const current = counts.get(copy.titleId) ?? { total: 0, available: 0 };
      current.total += 1;
      if (copy.availability === "available") current.available += 1;
      counts.set(copy.titleId, current);
    }
    return counts;
  }, [copies]);

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="scolapro-section-title">Catalog</h2>
            <p className="scolapro-section-description">Search the school’s canonical learning-resource catalog and current copy availability.</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <label className="block text-xs font-medium leading-4">Search catalog
              <span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, author, ISBN, grade…" className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-sm outline-none transition focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></span>
            </label>
            <Picker label="Subject" value={subject} onChange={setSubject} placeholder="All subjects" searchable options={[{ value: "", label: "All subjects" }, ...subjects.map((code) => ({ value: code, label: code }))]} />
          </div>
        </div>

        {filteredTitles.length ? (
          <div className="mt-4 divide-y divide-border-subtle">
            {filteredTitles.map((title) => {
              const counts = availableByTitle.get(title.id) ?? { total: 0, available: 0 };
              const titleCopies = copies.filter((copy) => copy.titleId === title.id);
              return (
                <article key={title.id} className="py-4 first:pt-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0"><p className="scolapro-record-title">{title.title}</p><p className="mt-1 text-xs text-muted-foreground">{[title.author, title.publisher, title.edition, title.subjectCode, title.gradeCode].filter(Boolean).join(" · ") || pretty(title.resourceType)}</p></div>
                    <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 font-semibold text-[color:var(--success)]">{counts.available} available</span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-muted-foreground">{counts.total} copies</span></div>
                  </div>
                  {titleCopies.length ? <div className="mt-3 flex flex-wrap gap-2">{titleCopies.map((copy) => <span key={copy.id} className="rounded-[var(--radius-xs)] border border-border-subtle bg-surface-muted/45 px-2.5 py-1.5 text-[0.68rem] text-muted-foreground">{copyLabel(copy)} · {pretty(copy.availability)} · {pretty(copy.condition)}</span>)}</div> : <p className="mt-2 text-xs text-muted-foreground">No physical copies recorded.</p>}
                </article>
              );
            })}
          </div>
        ) : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No catalog items match the current filters.</div>}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form action={issueAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="scolapro-section-title">Issue resource</h2>
          <p className="scolapro-section-description">Only currently available copies and borrowers validated by the existing school-local lifecycle can be issued.</p>
          <div className="mt-4 space-y-3">
            <Picker label="Available copy" name="copyId" value={copyId} onChange={setCopyId} placeholder={availableCopies.length ? "Choose copy" : "No copies available"} searchable disabled={!availableCopies.length} options={availableCopies.map((copy) => ({ value: copy.id, label: titleMap.get(copy.titleId)?.title ?? "Resource", helper: `${copyLabel(copy)} · ${pretty(copy.condition)}` }))} />
            <Picker label="Borrower type" name="borrowerType" value={borrowerType} onChange={(value) => { setBorrowerType(value as "learner" | "staff"); setBorrowerId(""); }} placeholder="Borrower type" options={[{ value: "learner", label: "Learner" }, { value: "staff", label: "Staff member" }]} />
            <SearchableSelect label="Borrower" name="borrowerId" value={borrowerId} onChange={setBorrowerId} placeholder={`Choose ${borrowerType}`} searchPlaceholder={`Search ${borrowerType}s…`} emptyMessage={(value) => `No ${borrowerType} found for '${value}'.`} options={borrowerOptions.map((borrower) => ({ value: borrower.id, label: borrower.name, helper: borrower.helper }))} />
            <DateField label="Due date" name="dueOn" value={dueOn} onChange={setDueOn} min={today} />
            <label className="block text-xs font-medium leading-4">Issue note<textarea name="notes" rows={3} placeholder="Optional note" className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 text-sm outline-none transition focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>
            <Button type="submit" className="w-full" loading={issuePending} disabled={issuePending || !copyId || !borrowerId}>{issuePending ? "Issuing…" : <><BookOpenText className="size-4" aria-hidden="true" />Issue resource</>}</Button>
          </div>
        </form>

        <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="scolapro-section-title">Active loans</h2><p className="scolapro-section-description">Open circulation records, including overdue items.</p></div><div className="flex gap-2"><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs font-semibold">{activeLoans.length} active</span><span className="rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]">{overdueLoans.length} overdue</span></div></div>
          {activeLoans.length ? <div className="mt-4 space-y-3">{activeLoans.map((loan) => {
            const copy = copyMap.get(loan.copyId); const title = copy ? titleMap.get(copy.titleId) : undefined; const overdue = loan.status === "overdue" || Boolean(loan.dueOn && loan.dueOn < today);
            return <article key={loan.id} className="rounded-[var(--radius-sm)] border border-border-subtle p-3.5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="scolapro-record-title">{title?.title ?? "Resource"}</p><p className="mt-1 text-xs text-muted-foreground">{loan.borrowerName} · {pretty(loan.borrowerType)} · issued {formatDate(loan.issuedOn)}</p></div><span className={overdue ? "rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]" : "rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--success)]"}>{overdue ? `Overdue · ${formatDate(loan.dueOn)}` : loan.dueOn ? `Due ${formatDate(loan.dueOn)}` : "Open"}</span></div><ReturnLoanForm loan={loan} title={title} copy={copy} /></article>;
          })}</div> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No active loans.</div>}
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3"><History className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" /><div><h2 className="scolapro-section-title">Recent lifecycle history</h2><p className="scolapro-section-description">Completed, lost or waived circulation records visible under the existing LTSM authorization boundary.</p></div></div>
        {history.length ? <div className="mt-4 divide-y divide-border-subtle">{history.map((loan) => { const copy = copyMap.get(loan.copyId); const title = copy ? titleMap.get(copy.titleId) : undefined; return <div key={loan.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{title?.title ?? "Resource"}</p><p className="mt-0.5 text-xs text-muted-foreground">{loan.borrowerName} · issued {formatDate(loan.issuedOn)}{loan.returnedOn ? ` · completed ${formatDate(loan.returnedOn)}` : ""}</p></div><span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{loan.status === "lost" ? <CircleAlert className="size-3.5 text-[color:var(--danger)]" /> : <CheckCircle2 className="size-3.5 text-[color:var(--success)]" />}{pretty(loan.status)}{loan.returnedCondition ? ` · ${pretty(loan.returnedCondition)}` : ""}</span></div>; })}</div> : <p className="mt-4 text-sm text-muted-foreground">No completed circulation history yet.</p>}
      </section>
    </div>
  );
}
