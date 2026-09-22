import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ReportCardBatchWorkerResult = {
  processed: number;
  completed: number;
  skipped: number;
  failed: number;
  pendingBatches: number;
  durationMs: number;
};

export async function processReportCardBatchQueue(limit = 50): Promise<ReportCardBatchWorkerResult> {
  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc("process_report_card_batch_items", {
    p_limit: Math.max(1, Math.min(limit, 100)),
  });
  if (error) throw new Error(`Unable to process report-card batches: ${error.message}`);

  const result = (data ?? {}) as {
    processed?: number;
    completed?: number;
    skipped?: number;
    failed?: number;
  };

  // A terminal PDF batch with zero completed learner items has nothing to
  // combine. Leaving export_status="waiting" would create permanent phantom
  // work that no export worker can ever claim.
  const { error: settleEmptyExportError } = await supabase
    .from("report_card_batches")
    .update({
      export_status: "not_applicable",
      export_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("operation", "pdf")
    .eq("export_status", "waiting")
    .eq("completed_items", 0)
    .in("status", ["completed", "partial"]);
  if (settleEmptyExportError) {
    throw new Error(`Unable to settle empty report-card PDF batches: ${settleEmptyExportError.message}`);
  }

  const { count, error: countError } = await supabase
    .from("report_card_batches")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"]);
  if (countError) throw new Error(`Unable to inspect report-card batch queue: ${countError.message}`);

  return {
    processed: Number(result.processed ?? 0),
    completed: Number(result.completed ?? 0),
    skipped: Number(result.skipped ?? 0),
    failed: Number(result.failed ?? 0),
    pendingBatches: count ?? 0,
    durationMs: Date.now() - startedAt,
  };
}
