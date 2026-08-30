import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderReportCardHtml } from "@/features/reporting/server/render-report-card-html";

type RenderJob = {
  id: string;
  school_id: string;
  snapshot_id: string;
  template_key: string;
  template_version: string;
  document_format: "html";
};

export type ReportCardRenderWorkerResult = {
  recovered: number;
  claimed: number;
  completed: number;
  failed: number;
  pending: number;
  retrying: number;
  dead: number;
  durationMs: number;
};

export async function processReportCardRenderQueue(limit = 25): Promise<ReportCardRenderWorkerResult> {
  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();

  const { data: recovered, error: recoveryError } = await supabase.rpc("recover_stale_report_card_render_jobs", {
    p_stale_after_seconds: 900,
    p_retry_after_seconds: 300,
    p_max_attempts: 5,
  });
  if (recoveryError) throw new Error(`Unable to recover stale render jobs: ${recoveryError.message}`);

  const { data: claimed, error: claimError } = await supabase.rpc("claim_report_card_render_jobs", {
    p_limit: limit,
    p_document_format: "html",
  });
  if (claimError) throw new Error(`Unable to claim render jobs: ${claimError.message}`);

  const jobs = (claimed ?? []) as RenderJob[];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const [{ data: snapshot, error: snapshotError }, { data: school, error: schoolError }] = await Promise.all([
        supabase
          .from("report_card_snapshots")
          .select("id,school_id,snapshot_version,data_snapshot,certified_at")
          .eq("id", job.snapshot_id)
          .single(),
        supabase.from("schools").select("id,name,emis_number").eq("id", job.school_id).single(),
      ]);

      if (snapshotError || !snapshot) throw new Error(snapshotError?.message ?? "Report-card snapshot not found");
      if (schoolError || !school) throw new Error(schoolError?.message ?? "School not found");

      const html = renderReportCardHtml({
        schoolName: school.name,
        schoolEmisNumber: school.emis_number,
        snapshotVersion: snapshot.snapshot_version,
        certifiedAt: snapshot.certified_at,
        dataSnapshot: snapshot.data_snapshot ?? {},
      });
      const bytes = new TextEncoder().encode(html);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const storagePath = `${job.school_id}/${job.snapshot_id}/${job.template_key}/${job.template_version}.html`;

      const { error: uploadError } = await supabase.storage.from("report-card-artifacts").upload(storagePath, bytes, {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);

      const { error: completeError } = await supabase.rpc("complete_report_card_render_job", {
        p_job_id: job.id,
        p_storage_bucket: "report-card-artifacts",
        p_storage_path: storagePath,
        p_content_sha256: checksum,
        p_page_count: null,
      });
      if (completeError) throw new Error(completeError.message);
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown report-card render error";
      console.error("report-card-render job failed", job.id, message);
      const { error: failError } = await supabase.rpc("fail_report_card_render_job", {
        p_job_id: job.id,
        p_error: message,
        p_retry_after_seconds: 300,
        p_max_attempts: 5,
      });
      if (failError) console.error("report-card-render failure state update failed", job.id, failError.message);
    }
  }

  const { data: queueRows, error: queueError } = await supabase
    .from("report_card_render_jobs")
    .select("status")
    .eq("document_format", "html")
    .in("status", ["pending", "retry", "dead"]);
  if (queueError) throw new Error(`Unable to inspect render queue: ${queueError.message}`);

  const pending = (queueRows ?? []).filter((row) => row.status === "pending").length;
  const retrying = (queueRows ?? []).filter((row) => row.status === "retry").length;
  const dead = (queueRows ?? []).filter((row) => row.status === "dead").length;

  return {
    recovered: Number(recovered ?? 0),
    claimed: jobs.length,
    completed,
    failed,
    pending,
    retrying,
    dead,
    durationMs: Date.now() - startedAt,
  };
}
