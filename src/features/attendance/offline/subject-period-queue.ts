import {
  enqueueOfflineMutation,
  listOfflineMutations,
  listOfflineSnapshots,
  offlineQueueSummary,
  removeOfflineMutation,
  saveOfflineSnapshot,
  updateOfflineMutation,
  type OfflineMutationRecord,
  type OfflineScope,
} from "@/lib/offline/db";
import type { SubjectPeriodRoster } from "@/features/attendance/server/subject-period";

export const SUBJECT_ATTENDANCE_MUTATION = "attendance.subject-period";
export const SUBJECT_ATTENDANCE_SNAPSHOT = "attendance.subject-period.snapshot";

export type OfflineSubjectPeriodPayload = {
  slotId: string;
  attendanceDate: string;
  clientMutationId: string;
  replacesSubmissionId: string | null;
  exceptions: Array<{ enrolment_id: string; status: "absent" | "late" | "excused" | "unknown"; reason_id: string | null; note: string | null }>;
};

export async function queueSubjectPeriodAttendance(scope: OfflineScope, payload: OfflineSubjectPeriodPayload) {
  const record = await enqueueOfflineMutation(scope, { id: payload.clientMutationId, kind: SUBJECT_ATTENDANCE_MUTATION, payload });
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return record;
}

export async function syncQueuedSubjectPeriodAttendance(scope: OfflineScope) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return offlineQueueSummary(scope);
  const records = await listOfflineMutations<OfflineSubjectPeriodPayload>(scope, SUBJECT_ATTENDANCE_MUTATION);
  for (const record of records) {
    if (record.status === "conflicted" || record.status === "rejected") continue;
    await updateOfflineMutation(record.id, { status: "syncing", lastError: null });
    try {
      const response = await fetch("/api/offline/attendance/subject-period", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: { userId: record.userId, tenantId: record.tenantId, schoolId: record.schoolId }, payload: record.payload }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (response.ok) await removeOfflineMutation(record.id);
      else if (response.status === 409) await updateOfflineMutation(record.id, { status: "conflicted", lastError: body.message ?? "This lesson attendance change needs review." });
      else if (response.status >= 400 && response.status < 500) await updateOfflineMutation(record.id, { status: "rejected", lastError: body.message ?? "This lesson attendance change was rejected." });
      else { await updateOfflineMutation(record.id, { status: "pending", lastError: body.message ?? "Sync will retry when the service is available." }); break; }
    } catch { await updateOfflineMutation(record.id, { status: "pending", lastError: "Sync will retry when the connection is stable." }); break; }
  }
  window.dispatchEvent(new Event("scolapro-offline-queue-changed"));
  return offlineQueueSummary(scope);
}

export async function cacheSubjectPeriodSnapshot(scope: OfflineScope, snapshot: SubjectPeriodRoster, attendanceDate: string) {
  return saveOfflineSnapshot(scope, SUBJECT_ATTENDANCE_SNAPSHOT, `${snapshot.slot.id}:${attendanceDate}`, { ...snapshot, attendanceDate });
}

export async function listCachedSubjectPeriodSnapshots(scope: OfflineScope) {
  return listOfflineSnapshots<SubjectPeriodRoster & { attendanceDate: string }>(scope, SUBJECT_ATTENDANCE_SNAPSHOT);
}

export type OfflineSubjectPeriodRecord = OfflineMutationRecord<OfflineSubjectPeriodPayload>;
