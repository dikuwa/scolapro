import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveCommunicationTransportAdapter,
  type CommunicationChannel,
  type CommunicationTransportInput,
} from "@/features/communications/server/transport-adapters";

type DeliveryJob = {
  id: string;
  tenant_id: string;
  school_id: string;
  message_id: string;
  recipient_id: string;
  channel: CommunicationChannel;
  provider_key: string | null;
  attempt_count: number;
};

type MessageRow = {
  id: string;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
};

type RecipientRow = {
  id: string;
  destination: string | null;
};

export type CommunicationDeliveryWorkerResult = {
  enabled: boolean;
  claimed: number;
  completed: number;
  failed: number;
  pending: number;
  retrying: number;
  dead: number;
  durationMs: number;
};

export async function processCommunicationDeliveryQueue(limit = 25): Promise<CommunicationDeliveryWorkerResult> {
  const startedAt = Date.now();
  if (process.env.COMMUNICATIONS_ENABLED !== "true") {
    return {
      enabled: false,
      claimed: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      retrying: 0,
      dead: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const supabase = createSupabaseAdminClient();
  const boundedLimit = Math.max(1, Math.min(limit, 100));

  const { data: claimed, error: claimError } = await supabase.rpc("claim_communication_delivery_jobs", {
    p_limit: boundedLimit,
  });
  if (claimError) throw new Error(`Unable to claim communication delivery jobs: ${claimError.message}`);

  const jobs = (claimed ?? []) as DeliveryJob[];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const [{ data: message, error: messageError }, { data: recipient, error: recipientError }] = await Promise.all([
        supabase
          .from("communication_messages")
          .select("id,channel,subject,body")
          .eq("id", job.message_id)
          .single(),
        supabase.from("communication_recipients").select("id,destination").eq("id", job.recipient_id).single(),
      ]);

      if (messageError || !message) throw new Error(messageError?.message ?? "Communication message not found.");
      if (recipientError || !recipient) throw new Error(recipientError?.message ?? "Communication recipient not found.");

      const messageRow = message as MessageRow;
      const recipientRow = recipient as RecipientRow;
      if (messageRow.channel !== job.channel) throw new Error("Communication job channel does not match its message.");

      const adapter = resolveCommunicationTransportAdapter(job.channel, job.provider_key);
      const input: CommunicationTransportInput = {
        jobId: job.id,
        attemptCount: job.attempt_count,
        providerKey: job.provider_key,
        channel: job.channel,
        destination: recipientRow.destination,
        subject: messageRow.subject,
        body: messageRow.body,
      };
      const accepted = await adapter.send(input);

      const { error: completeError } = await supabase.rpc("complete_communication_delivery_job", {
        p_job_id: job.id,
        p_provider_key: accepted.providerKey,
        p_provider_message_id: accepted.providerMessageId,
      });
      if (completeError) throw new Error(`Unable to complete communication delivery job: ${completeError.message}`);
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown communication transport error";
      console.error("communication delivery job failed", job.id, message);

      const { error: failError } = await supabase.rpc("fail_communication_delivery_job", {
        p_job_id: job.id,
        p_error: message,
        p_retry_after_seconds: 300,
        p_max_attempts: 5,
      });
      if (failError) console.error("communication delivery failure state update failed", job.id, failError.message);
    }
  }

  const { data: queueRows, error: queueError } = await supabase
    .from("communication_delivery_jobs")
    .select("status")
    .in("status", ["pending", "retry", "dead"]);
  if (queueError) throw new Error(`Unable to inspect communication delivery queue: ${queueError.message}`);

  return {
    enabled: true,
    claimed: jobs.length,
    completed,
    failed,
    pending: (queueRows ?? []).filter((row) => row.status === "pending").length,
    retrying: (queueRows ?? []).filter((row) => row.status === "retry").length,
    dead: (queueRows ?? []).filter((row) => row.status === "dead").length,
    durationMs: Date.now() - startedAt,
  };
}
