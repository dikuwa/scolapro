import {
  enqueueOfflineMutation,
  listOfflineMutations,
  offlineQueueSummary,
  removeOfflineMutation,
  updateOfflineMutation,
  type OfflineMutationRecord,
  type OfflineScope,
} from "@/lib/offline/db";

export const DAILY_ATTENDANCE_MUTATION = "attendance.daily-register";

export type OfflineDailyRegisterPayload = {
  registerClassId: string;
  attendanceDate: string;
  clientMutationId: string;
  replacesSubmissionId: string | null;
  exceptions: Array<{
    enrolment_id: string;
    status: "absent" | "late" | "excused" | "unknown";
    reason_id?: string | null;
    note?: string | null;
  }>;
};

export async function queueDailyRegister(scope: OfflineScope, payload: OfflineDailyRegisterPayload) {
  const record = await enqueueOfflineMutation(scope, {
    id: payload.clientMutationId,
    kind: DAILY_ATTENDANCE_MUTATION,
    payload,
  });
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return record;
}

export async function syncQueuedDailyRegisters(scope: OfflineScope) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return offlineQueueSummary(scope);

  const records = await listOfflineMutations<OfflineDailyRegisterPayload>(scope, DAILY_ATTENDANCE_MUTATION);
  for (const record of records) {
    if (record.status === "conflicted" || record.status === "rejected") continue;
    await updateOfflineMutation(record.id, { status: "syncing", lastError: null });

    try {
      const response = await fetch("/api/offline/attendance", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: { userId: record.userId, tenantId: record.tenantId, schoolId: record.schoolId },
          payload: record.payload,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };

      if (response.ok) {
        await removeOfflineMutation(record.id);
      } else if (response.status === 409) {
        await updateOfflineMutation(record.id, { status: "conflicted", lastError: body.message ?? "This attendance change needs review." });
      } else if (response.status >= 400 && response.status < 500) {
        await updateOfflineMutation(record.id, { status: "rejected", lastError: body.message ?? "This attendance change was rejected." });
      } else {
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

export function hasQueuedEvidence(form: HTMLFormElement) {
  return Array.from(form.elements).some((element) => element instanceof HTMLInputElement && element.type === "file" && Boolean(element.files?.length));
}

export type OfflineDailyRegisterRecord = OfflineMutationRecord<OfflineDailyRegisterPayload>;
