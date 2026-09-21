import {
  enqueueOfflineMutation, listOfflineMutations, listOfflineSnapshots, offlineQueueSummary,
  removeOfflineMutation, saveOfflineSnapshot, updateOfflineMutation,
  type OfflineMutationRecord, type OfflineScope,
} from "@/lib/offline/db";
import type { CoverageAllocation, CoverageScheduleItem } from "@/features/teaching/server/coverage-queries";

export const TEACHING_COVERAGE_MUTATION = "teaching.coverage.actual";
export const TEACHING_COVERAGE_SNAPSHOT = "teaching.coverage.snapshot";
export type OfflineTeachingCoveragePayload = { clientMutationId: string; scheduleItemId: string; taughtOn: string; periodsUsed: number; coverageState: string; reflection: string; compensatoryAction: string };
export type OfflineTeachingCoverageSnapshot = { academicYear: number; allocations: CoverageAllocation[]; scheduleItems: CoverageScheduleItem[] };

export async function queueTeachingActual(scope: OfflineScope, payload: OfflineTeachingCoveragePayload) {
  const record = await enqueueOfflineMutation(scope, { id: payload.clientMutationId, kind: TEACHING_COVERAGE_MUTATION, payload });
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return record;
}

export async function syncQueuedTeachingActuals(scope: OfflineScope) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return offlineQueueSummary(scope);
  const records = await listOfflineMutations<OfflineTeachingCoveragePayload>(scope, TEACHING_COVERAGE_MUTATION);
  for (const record of records) {
    if (record.status === "conflicted" || record.status === "rejected") continue;
    await updateOfflineMutation(record.id, { status: "syncing", lastError: null });
    try {
      const response = await fetch("/api/offline/teaching/coverage", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: { userId: record.userId, tenantId: record.tenantId, schoolId: record.schoolId }, payload: record.payload }) });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (response.ok) await removeOfflineMutation(record.id);
      else if (response.status === 409) await updateOfflineMutation(record.id, { status: "conflicted", lastError: body.message ?? "This teaching actual needs attention." });
      else if (response.status >= 400 && response.status < 500) await updateOfflineMutation(record.id, { status: "rejected", lastError: body.message ?? "This teaching actual was rejected." });
      else { await updateOfflineMutation(record.id, { status: "pending", lastError: body.message ?? "Sync will retry when the service is available." }); break; }
    } catch { await updateOfflineMutation(record.id, { status: "pending", lastError: "Sync will retry when the connection is stable." }); break; }
  }
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return offlineQueueSummary(scope);
}

export async function cacheTeachingCoverageSnapshot(scope: OfflineScope, snapshot: OfflineTeachingCoverageSnapshot) {
  return saveOfflineSnapshot(scope, TEACHING_COVERAGE_SNAPSHOT, String(snapshot.academicYear), snapshot);
}

export async function listCachedTeachingCoverageSnapshots(scope: OfflineScope) {
  return listOfflineSnapshots<OfflineTeachingCoverageSnapshot>(scope, TEACHING_COVERAGE_SNAPSHOT);
}

export type OfflineTeachingCoverageRecord = OfflineMutationRecord<OfflineTeachingCoveragePayload>;
