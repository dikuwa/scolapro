import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CommunicationDeliveryDiagnostic = {
  deliveryJobId: string;
  channel: string;
  providerKey: string | null;
  status: string;
  attemptCount: number;
  availableAt: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  latestOutcome: string | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  latestErrorCode: string | null;
};

export async function getCommunicationDeliveryDiagnostics(
  schoolId: string,
): Promise<CommunicationDeliveryDiagnostic[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("list_communication_delivery_diagnostics", {
    p_school_id: schoolId,
    p_limit: 100,
  });
  if (error) throw new Error("Unable to load communication delivery diagnostics.");

  return (data ?? []).map((row) => ({
    deliveryJobId: String(row.delivery_job_id),
    channel: String(row.channel),
    providerKey: row.provider_key ? String(row.provider_key) : null,
    status: String(row.status),
    attemptCount: Number(row.attempt_count ?? 0),
    availableAt: row.available_at ? String(row.available_at) : null,
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    latestOutcome: row.latest_outcome ? String(row.latest_outcome) : null,
    latestStartedAt: row.latest_started_at ? String(row.latest_started_at) : null,
    latestFinishedAt: row.latest_finished_at ? String(row.latest_finished_at) : null,
    latestErrorCode: row.latest_error_code ? String(row.latest_error_code) : null,
  }));
}
