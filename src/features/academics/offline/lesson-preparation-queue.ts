import { enqueueOfflineMutation, listOfflineMutations, listOfflineSnapshots, offlineQueueSummary, removeOfflineMutation, saveOfflineSnapshot, updateOfflineMutation, type OfflineScope } from "@/lib/offline/db";

export const LESSON_PREPARATION_MUTATION = "teaching.lesson-preparation.draft";
export const LESSON_PREPARATION_SNAPSHOT = "teaching.lesson-preparation.draft.snapshot";
export type OfflineLessonPreparationPayload = {
  scheduleId: string;
  clientMutationId: string;
  expectedUpdatedAt: string | null;
  preparation: Record<string, string>;
  selectedCompetencyIds: string[];
  sessionCount: number;
};

export async function queueLessonPreparationDraft(scope: OfflineScope, payload: OfflineLessonPreparationPayload) {
  await saveOfflineSnapshot(scope, LESSON_PREPARATION_SNAPSHOT, payload.scheduleId, payload);
  const result = await enqueueOfflineMutation(scope, { id: payload.clientMutationId, kind: LESSON_PREPARATION_MUTATION, payload });
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return result;
}

export async function getCachedLessonPreparationDraft(scope: OfflineScope, scheduleId: string) {
  const rows = await listOfflineSnapshots<OfflineLessonPreparationPayload>(scope, LESSON_PREPARATION_SNAPSHOT);
  return rows.find((row) => row.payload.scheduleId === scheduleId)?.payload ?? null;
}

export async function syncQueuedLessonPreparationDrafts(scope: OfflineScope) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return offlineQueueSummary(scope);
  const rows = await listOfflineMutations<OfflineLessonPreparationPayload>(scope, LESSON_PREPARATION_MUTATION);
  for (const row of rows) {
    if (row.status === "conflicted" || row.status === "rejected") continue;
    await updateOfflineMutation(row.id, { status: "syncing", lastError: null });
    try {
      const response = await fetch("/api/offline/lesson-preparation", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: { userId: row.userId, tenantId: row.tenantId, schoolId: row.schoolId }, payload: row.payload }),
      });
      const body = await response.json().catch(() => ({})) as { message?: string; updatedAt?: string };
      if (response.ok) {
        await removeOfflineMutation(row.id);
        await saveOfflineSnapshot(scope, LESSON_PREPARATION_SNAPSHOT, row.payload.scheduleId, {
          ...row.payload,
          clientMutationId: crypto.randomUUID(),
          expectedUpdatedAt: body.updatedAt ?? row.payload.expectedUpdatedAt,
        });
      }
      else if (response.status === 409) await updateOfflineMutation(row.id, { status: "conflicted", lastError: body.message ?? "This draft needs online review." });
      else if (response.status >= 400 && response.status < 500) await updateOfflineMutation(row.id, { status: "rejected", lastError: body.message ?? "This draft was rejected." });
      else { await updateOfflineMutation(row.id, { status: "pending", lastError: body.message ?? "Sync will retry when online." }); break; }
    } catch { await updateOfflineMutation(row.id, { status: "pending", lastError: "Sync will retry when the connection is stable." }); break; }
  }
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return offlineQueueSummary(scope);
}