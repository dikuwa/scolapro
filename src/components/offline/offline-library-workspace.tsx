"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenText, CloudOff, History, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import {
  LIBRARY_CIRCULATION_MUTATION,
  LIBRARY_CIRCULATION_SNAPSHOT,
  queueLibraryCirculation,
  type OfflineLibraryCirculationPayload,
} from "@/features/library/offline/circulation-queue";
import type { LibraryBorrower, LibraryCopy, LibraryLoan } from "@/features/library/server/queries";
import {
  getActiveOfflineScope,
  listOfflineMutations,
  listOfflineSnapshots,
  type OfflineMutationRecord,
  type OfflineScope,
  type OfflineSnapshot,
} from "@/lib/offline/db";

type LibraryCirculationSnapshot = {
  copies: LibraryCopy[];
  borrowers: LibraryBorrower[];
  loans: LibraryLoan[];
};

type SnapshotRecord = OfflineSnapshot<LibraryCirculationSnapshot>;
type QueuedCirculation = OfflineMutationRecord<OfflineLibraryCirculationPayload & { clientMutationId: string }>;

function copyLabel(copy: LibraryCopy) {
  return [copy.barcode || copy.assetNumber || `Copy ${copy.id.slice(0, 8)}`, copy.locationLabel, copy.condition].filter(Boolean).join(" · ");
}

function loanLabel(loan: LibraryLoan, copies: Map<string, LibraryCopy>) {
  const copy = copies.get(loan.copyId);
  return `${copy ? copyLabel(copy) : "Tracked copy"} · ${loan.borrowerName}`;
}

export function OfflineLibraryWorkspace() {
  const [scope, setScope] = useState<OfflineScope | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotRecord | null>(null);
  const [queued, setQueued] = useState<QueuedCirculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyId, setCopyId] = useState("");
  const [borrowerType, setBorrowerType] = useState<"learner" | "staff">("learner");
  const [borrowerId, setBorrowerId] = useState("");
  const [loanId, setLoanId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [message, setMessage] = useState("");

  const loadOfflineLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const activeScope = await getActiveOfflineScope();
      if (!activeScope) {
        setScope(null);
        setSnapshot(null);
        setQueued([]);
        return;
      }

      const [snapshots, mutations] = await Promise.all([
        listOfflineSnapshots<LibraryCirculationSnapshot>(activeScope, LIBRARY_CIRCULATION_SNAPSHOT),
        listOfflineMutations<OfflineLibraryCirculationPayload & { clientMutationId: string }>(activeScope, LIBRARY_CIRCULATION_MUTATION),
      ]);
      const current = snapshots[0] ?? null;
      setScope(activeScope);
      setSnapshot(current);
      setQueued(mutations);
      if (current) {
        const copies = current.payload.copies.filter((copy) => copy.availability === "available");
        const borrowers = current.payload.borrowers.filter((borrower) => borrower.type === borrowerType);
        setCopyId((currentValue) => currentValue && copies.some((copy) => copy.id === currentValue) ? currentValue : copies[0]?.id ?? "");
        setBorrowerId((currentValue) => currentValue && borrowers.some((borrower) => borrower.id === currentValue) ? currentValue : borrowers[0]?.id ?? "");
        setLoanId((currentValue) => currentValue && current.payload.loans.some((loan) => loan.id === currentValue) ? currentValue : current.payload.loans[0]?.id ?? "");
      }
    } catch {
      setScope(null);
      setSnapshot(null);
      setQueued([]);
    } finally {
      setLoading(false);
    }
  }, [borrowerType]);

  useEffect(() => {
    queueMicrotask(() => { void loadOfflineLibrary(); });
  }, [loadOfflineLibrary]);

  const copies = useMemo(() => snapshot?.payload.copies ?? [], [snapshot]);
  const borrowers = useMemo(() => snapshot?.payload.borrowers ?? [], [snapshot]);
  const loans = useMemo(() => snapshot?.payload.loans ?? [], [snapshot]);
  const copyMap = useMemo(() => new Map(copies.map((copy) => [copy.id, copy])), [copies]);
  const availableCopies = useMemo(() => copies.filter((copy) => copy.availability === "available"), [copies]);
  const borrowerOptions = useMemo(() => borrowers.filter((borrower) => borrower.type === borrowerType), [borrowers, borrowerType]);
  const selectedLoan = loans.find((loan) => loan.id === loanId) ?? null;
  const pending = queued.filter((record) => record.status === "pending" || record.status === "syncing");
  const attention = queued.filter((record) => record.status === "conflicted" || record.status === "rejected");

  async function queueIssue() {
    if (!scope || !copyId || !borrowerId) return;
    if (typeof navigator !== "undefined" && navigator.onLine) {
      setMessage("This fallback is for offline work. Reopen Library / Textbooks while online to make a server-backed issue.");
      return;
    }

    setSaving(true);
    try {
      await queueLibraryCirculation(scope, {
        action: "issue",
        copyId,
        borrowerType,
        borrowerId,
        dueOn: dueOn || null,
        notes: null,
      });
      setMessage("Issue intent saved on this device. The copy remains unallocated until server sync accepts it.");
      await loadOfflineLibrary();
    } catch {
      setMessage("The issue intent could not be stored on this device.");
    } finally {
      setSaving(false);
    }
  }

  async function queueReturn() {
    if (!scope || !selectedLoan) return;
    if (typeof navigator !== "undefined" && navigator.onLine) {
      setMessage("This fallback is for offline work. Reopen Library / Textbooks while online to make a server-backed return.");
      return;
    }

    setSaving(true);
    try {
      await queueLibraryCirculation(scope, {
        action: "return",
        loanId: selectedLoan.id,
        returnedCondition: selectedLoan.returnedCondition ?? "good",
        notes: null,
      });
      setMessage("Return intent saved on this device. The cached loan remains active until server sync accepts it.");
      await loadOfflineLibrary();
    } catch {
      setMessage("The return intent could not be stored on this device.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted p-4 text-sm text-muted-foreground" aria-busy="true">
        Loading cached library circulation…
      </section>
    );
  }

  if (!scope || !snapshot) {
    return (
      <section className="mt-6 rounded-[var(--radius-md)] border border-dashed border-border bg-surface-muted p-4 text-sm leading-6 text-muted-foreground">
        No library circulation snapshot is available on this device yet. Open Library / Textbooks once while online so the current bounded copies, borrowers and active loans can be used during an outage.
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><CloudOff className="size-4" aria-hidden="true" /></span>
            <div>
              <h2 className="scolapro-section-title">Library circulation fallback</h2>
              <p className="scolapro-section-description">Use the current bounded offline snapshot for one issue or return intent. Nothing here is server-confirmed until sync accepts it.</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-[color:var(--warning)]"><CloudOff className="size-3.5" aria-hidden="true" />Local only</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] text-muted-foreground">
          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5">{copies.length} cached copies</span>
          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5">{borrowers.length} cached borrowers</span>
          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5">{loans.length} active loans</span>
        </div>
      </div>

      {pending.length || attention.length ? (
        <div className="border-b border-border-subtle bg-surface-muted/55 px-4 py-3 sm:px-5" role="status" aria-live="polite">
          <div className="flex items-start gap-2">
            {attention.length ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[color:var(--warning)]" aria-hidden="true" /> : <RefreshCw className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />}
            <p className="text-xs text-muted-foreground">
              {pending.length ? `${pending.length} local circulation intent${pending.length === 1 ? "" : "s"} waiting to sync.` : ""}
              {pending.length && attention.length ? " " : ""}
              {attention.length ? `${attention.length} earlier intent${attention.length === 1 ? " needs" : "s need"} server review.` : ""}
              {" "}The snapshot is not changed to imply final allocation.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
        <section className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-4">
          <div className="flex items-center gap-2"><BookOpenText className="size-4 text-brand-strong" aria-hidden="true" /><h3 className="scolapro-section-title">Queue one issue intent</h3></div>
          <p className="scolapro-section-description">Choose from cached available copies and borrowers. This does not allocate the copy until the server accepts sync.</p>
          <div className="mt-4 space-y-3">
            <Picker label="Cached available copy" value={copyId} onChange={setCopyId} options={availableCopies.map((copy) => ({ value: copy.id, label: copyLabel(copy) }))} placeholder="Choose copy" searchable searchPlaceholder="Search cached copies" />
            <Picker label="Borrower type" value={borrowerType} onChange={(value) => { setBorrowerType(value as "learner" | "staff"); setBorrowerId(""); }} options={[{ value: "learner", label: "Learner" }, { value: "staff", label: "Staff member" }]} placeholder="Learner" />
            <Picker label="Cached borrower" value={borrowerId} onChange={setBorrowerId} options={borrowerOptions.map((borrower) => ({ value: borrower.id, label: borrower.name, helper: borrower.helper }))} placeholder="Choose borrower" searchable searchPlaceholder="Search cached borrowers" />
            <DateField label="Due date (optional)" name="offline-library-due-on" value={dueOn} onChange={setDueOn} />
            <Button type="button" onClick={() => void queueIssue()} loading={saving} disabled={!copyId || !borrowerId}><BookOpenText className="size-4" aria-hidden="true" />Save issue intent</Button>
          </div>
        </section>

        <section className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-4">
          <div className="flex items-center gap-2"><History className="size-4 text-brand-strong" aria-hidden="true" /><h3 className="scolapro-section-title">Queue one return intent</h3></div>
          <p className="scolapro-section-description">Choose an active cached loan. The loan stays active locally until server replay accepts the return.</p>
          <div className="mt-4 space-y-3">
            <Picker label="Cached active loan" value={loanId} onChange={setLoanId} options={loans.map((loan) => ({ value: loan.id, label: loanLabel(loan, copyMap) }))} placeholder="Choose active loan" searchable searchPlaceholder="Search cached loans" />
            {selectedLoan ? <p className="rounded-[var(--radius-xs)] bg-surface px-3 py-2.5 text-xs text-muted-foreground">{selectedLoan.borrowerName} · {selectedLoan.status === "overdue" ? "Overdue" : "Open"} · local return only</p> : null}
            <Button type="button" onClick={() => void queueReturn()} loading={saving} disabled={!selectedLoan} variant="neutral"><History className="size-4" aria-hidden="true" />Save return intent</Button>
          </div>
        </section>
      </div>

      {message ? <p className="border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground sm:px-5" role="status">{message}</p> : null}
    </section>
  );
}