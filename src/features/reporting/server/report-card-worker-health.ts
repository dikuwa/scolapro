import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ReportCardWorkerHealth = {
  batches: {
    pending: number;
    processing: number;
    oldestActiveAt: string | null;
  };
  renders: {
    pending: number;
    retrying: number;
    processing: number;
    dead: number;
    oldestReadyAt: string | null;
  };
  exports: {
    waiting: number;
    processing: number;
    failed: number;
    oldestWaitingAt: string | null;
  };
};

function countResult(count: number | null) {
  return count ?? 0;
}

export async function getReportCardWorkerHealth(): Promise<ReportCardWorkerHealth> {
  const supabase = createSupabaseAdminClient();

  const [
    pendingBatch,
    processingBatch,
    pendingRender,
    retryRender,
    processingRender,
    deadRender,
    waitingExport,
    processingExport,
    failedExport,
    oldestBatch,
    oldestRender,
    oldestExport,
  ] = await Promise.all([
    supabase.from("report_card_batches").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("report_card_batches").select("id", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("report_card_render_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("report_card_render_jobs").select("id", { count: "exact", head: true }).eq("status", "retry"),
    supabase.from("report_card_render_jobs").select("id", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("report_card_render_jobs").select("id", { count: "exact", head: true }).eq("status", "dead"),
    supabase.from("report_card_batches").select("id", { count: "exact", head: true }).eq("operation", "pdf").eq("export_status", "waiting"),
    supabase.from("report_card_batches").select("id", { count: "exact", head: true }).eq("operation", "pdf").eq("export_status", "processing"),
    supabase.from("report_card_batches").select("id", { count: "exact", head: true }).eq("operation", "pdf").eq("export_status", "failed"),
    supabase.from("report_card_batches").select("created_at").in("status", ["pending", "processing"]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("report_card_render_jobs").select("available_at").in("status", ["pending", "retry"]).order("available_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("report_card_batches").select("created_at").eq("operation", "pdf").eq("export_status", "waiting").order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);

  const errors = [
    pendingBatch.error,
    processingBatch.error,
    pendingRender.error,
    retryRender.error,
    processingRender.error,
    deadRender.error,
    waitingExport.error,
    processingExport.error,
    failedExport.error,
    oldestBatch.error,
    oldestRender.error,
    oldestExport.error,
  ].filter(Boolean);
  if (errors.length) throw new Error("Unable to inspect report-card worker health.");

  return {
    batches: {
      pending: countResult(pendingBatch.count),
      processing: countResult(processingBatch.count),
      oldestActiveAt: oldestBatch.data?.created_at ?? null,
    },
    renders: {
      pending: countResult(pendingRender.count),
      retrying: countResult(retryRender.count),
      processing: countResult(processingRender.count),
      dead: countResult(deadRender.count),
      oldestReadyAt: oldestRender.data?.available_at ?? null,
    },
    exports: {
      waiting: countResult(waitingExport.count),
      processing: countResult(processingExport.count),
      failed: countResult(failedExport.count),
      oldestWaitingAt: oldestExport.data?.created_at ?? null,
    },
  };
}
