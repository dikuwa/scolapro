import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveCommunicationTransportAdapter,
  type CommunicationChannel,
  type CommunicationTemplateTransportContext,
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
  template_version_id: string | null;
  template_parameters: Record<string, unknown>;
};

type RecipientRow = {
  id: string;
  destination: string | null;
};

type TemplateVersionRow = {
  id: string;
  language: string;
  variables: unknown;
  status: string;
};

type ProviderTemplateBindingRow = {
  provider_key: string;
  provider_template_key: string;
  provider_language: string | null;
  approval_status: string;
  active: boolean;
  provider_config: Record<string, unknown>;
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

async function loadTemplateTransportContext(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  message: MessageRow,
  providerKey: string | null,
): Promise<CommunicationTemplateTransportContext | null> {
  if (!message.template_version_id) return null;
  if (!providerKey) throw new Error("A provider key is required for template-bound communications.");

  const [{ data: version, error: versionError }, { data: binding, error: bindingError }] = await Promise.all([
    supabase
      .from("communication_template_versions")
      .select("id,language,variables,status")
      .eq("id", message.template_version_id)
      .single(),
    supabase
      .from("communication_provider_template_bindings")
      .select("provider_key,provider_template_key,provider_language,approval_status,active,provider_config")
      .eq("template_version_id", message.template_version_id)
      .eq("provider_key", providerKey)
      .single(),
  ]);

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Communication template version not found.");
  }
  if (bindingError || !binding) {
    throw new Error(bindingError?.message ?? `No provider template binding exists for ${providerKey}.`);
  }

  const versionRow = version as TemplateVersionRow;
  const bindingRow = binding as ProviderTemplateBindingRow;
  if (versionRow.status !== "approved") throw new Error("Communication template version is no longer approved.");
  if (!bindingRow.active || bindingRow.approval_status !== "approved") {
    throw new Error(`Provider template binding for ${providerKey} is not active and approved.`);
  }

  return {
    versionId: versionRow.id,
    language: versionRow.language,
    variables: versionRow.variables,
    parameters: message.template_parameters ?? {},
    providerTemplateKey: bindingRow.provider_template_key,
    providerLanguage: bindingRow.provider_language,
    providerConfig: bindingRow.provider_config ?? {},
  };
}

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
          .select("id,channel,subject,body,template_version_id,template_parameters")
          .eq("id", job.message_id)
          .single(),
        supabase.from("communication_recipients").select("id,destination").eq("id", job.recipient_id).single(),
      ]);

      if (messageError || !message) throw new Error(messageError?.message ?? "Communication message not found.");
      if (recipientError || !recipient) throw new Error(recipientError?.message ?? "Communication recipient not found.");

      const messageRow = message as MessageRow;
      const recipientRow = recipient as RecipientRow;
      if (messageRow.channel !== job.channel) throw new Error("Communication job channel does not match its message.");

      const template = await loadTemplateTransportContext(supabase, messageRow, job.provider_key);
      const adapter = resolveCommunicationTransportAdapter(job.channel, job.provider_key);
      const input: CommunicationTransportInput = {
        jobId: job.id,
        attemptCount: job.attempt_count,
        providerKey: job.provider_key,
        channel: job.channel,
        destination: recipientRow.destination,
        subject: messageRow.subject,
        body: messageRow.body,
        template,
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
