import {
  enqueueOfflineMutation,
  listOfflineMutations,
  offlineQueueSummary,
  removeOfflineMutation,
  saveOfflineSnapshot,
  updateOfflineMutation,
  type OfflineScope,
} from "@/lib/offline/db";

export const ASSESSMENT_MARK_DRAFT_MUTATION = "assessment.marks-draft";
export const ASSESSMENT_MARK_DRAFT_SNAPSHOT = "assessment.marks-draft.snapshot";

export type OfflineAssessmentMarkDraftPayload = {
  assessmentInstanceId: string;
  enrolmentId: string;
  learnerId: string;
  numericMark: number | null;
  markStatus: "absent" | "exempt" | "incomplete" | "withheld" | null;
  teacherNote: string | null;
  expectedVersion: string | null;
  clientMutationId: string;
};

export async function queueAssessmentMarkDraft(
  scope: OfflineScope,
  payload: OfflineAssessmentMarkDraftPayload,
) {
  const record = await enqueueOfflineMutation(scope, {
    id: payload.clientMutationId,
    kind: ASSESSMENT_MARK_DRAFT_MUTATION,
    payload,
  });
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return record;
}

export async function syncQueuedAssessmentMarkDrafts(scope: OfflineScope) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return offlineQueueSummary(scope);

  const records = await listOfflineMutations<OfflineAssessmentMarkDraftPayload>(
    scope,
    ASSESSMENT_MARK_DRAFT_MUTATION,
  );
  for (const record of records) {
    if (record.status === "conflicted" || record.status === "rejected") continue;
    await updateOfflineMutation(record.id, { status: "syncing", lastError: null });
    try {
      const response = await fetch("/api/offline/assessment/marks", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: { userId: record.userId, tenantId: record.tenantId, schoolId: record.schoolId },
          payload: record.payload,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      const safeMessage = body.code === "stale_version"
        ? "A newer mark draft already exists. Review the current mark before trying again."
        : body.code === "assessment_not_editable"
          ? "This assessment is no longer open for mark entry."
          : body.code === "idempotency_payload_mismatch"
            ? "This offline mark change no longer matches its original queued draft."
            : body.message;
      if (response.ok) await removeOfflineMutation(record.id);
      else if (response.status === 409) {
        await updateOfflineMutation(record.id, {
          status: body.code === "assessment_not_editable" ? "rejected" : "conflicted",
          lastError: safeMessage ?? "This mark draft needs attention.",
        });
      } else if (response.status >= 400 && response.status < 500) {
        await updateOfflineMutation(record.id, {
          status: "rejected",
          lastError: safeMessage ?? "This mark draft was rejected.",
        });
      } else {
        await updateOfflineMutation(record.id, {
          status: "pending",
          lastError: safeMessage ?? "Sync will retry when the service is available.",
        });
        break;
      }
    } catch {
      await updateOfflineMutation(record.id, {
        status: "pending",
        lastError: "Sync will retry when the connection is stable.",
      });
      break;
    }
  }
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return offlineQueueSummary(scope);
}

export async function cacheAssessmentMarkDraftReference(
  scope: OfflineScope,
  snapshot: { assessmentInstanceId: string; learners: unknown[] },
) {
  return saveOfflineSnapshot(
    scope,
    ASSESSMENT_MARK_DRAFT_SNAPSHOT,
    snapshot.assessmentInstanceId,
    { assessmentInstanceId: snapshot.assessmentInstanceId, learners: snapshot.learners.slice(0, 200) },
  );
}