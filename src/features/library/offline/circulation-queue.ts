import {
  enqueueOfflineMutation,
  offlineQueueSummary,
  listOfflineMutations,
  removeOfflineMutation,
  saveOfflineSnapshot,
  updateOfflineMutation,
  type OfflineScope,
} from "@/lib/offline/db";
import type { LibraryBorrower, LibraryCopy, LibraryLoan } from "@/features/library/server/queries";

export const LIBRARY_CIRCULATION_MUTATION = "library.circulation";
export const LIBRARY_CIRCULATION_SNAPSHOT = "library.circulation.snapshot";

export type OfflineLibraryIssuePayload = {
  action: "issue";
  copyId: string;
  borrowerType: "learner" | "staff";
  borrowerId: string;
  dueOn: string | null;
  notes: string | null;
};

export type OfflineLibraryReturnPayload = {
  action: "return";
  loanId: string;
  returnedCondition: string;
  notes: string | null;
};

export type OfflineLibraryCirculationPayload = OfflineLibraryIssuePayload | OfflineLibraryReturnPayload;

export async function queueLibraryCirculation(scope: OfflineScope, payload: OfflineLibraryCirculationPayload) {
  const id = crypto.randomUUID();
  const record = await enqueueOfflineMutation(scope, {
    id,
    kind: LIBRARY_CIRCULATION_MUTATION,
    payload: { ...payload, clientMutationId: id },
  });
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return record;
}

export async function syncQueuedLibraryCirculation(scope: OfflineScope) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return offlineQueueSummary(scope);
  const records = await listOfflineMutations<OfflineLibraryCirculationPayload & { clientMutationId: string }>(scope, LIBRARY_CIRCULATION_MUTATION);
  for (const record of records) {
    if (record.status === "conflicted" || record.status === "rejected") continue;
    await updateOfflineMutation(record.id, { status: "syncing", lastError: null });
    try {
      const response = await fetch("/api/offline/library", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: { userId: record.userId, tenantId: record.tenantId, schoolId: record.schoolId },
          payload: record.payload,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (response.ok) await removeOfflineMutation(record.id);
      else if (response.status === 409) await updateOfflineMutation(record.id, { status: "conflicted", lastError: body.message ?? "This circulation change needs review." });
      else if (response.status >= 400 && response.status < 500) await updateOfflineMutation(record.id, { status: "rejected", lastError: body.message ?? "This circulation change was rejected." });
      else {
        await updateOfflineMutation(record.id, { status: "pending", lastError: body.message ?? "Sync will retry when the service is available." });
        break;
      }
    } catch {
      await updateOfflineMutation(record.id, { status: "pending", lastError: "Sync will retry when the connection is stable." });
      break;
    }
  }
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return offlineQueueSummary(scope);
}

export async function cacheLibraryCirculationSnapshot(
  scope: OfflineScope,
  snapshot: { copies: LibraryCopy[]; borrowers: LibraryBorrower[]; loans: LibraryLoan[] },
) {
  return saveOfflineSnapshot(scope, LIBRARY_CIRCULATION_SNAPSHOT, "current", {
    copies: snapshot.copies.slice(0, 100),
    borrowers: snapshot.borrowers.slice(0, 100),
    loans: snapshot.loans.filter((loan) => ["open", "overdue"].includes(loan.status)).slice(0, 100),
  });
}
