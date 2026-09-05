import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderReportCardHtmlWithSchoolFont } from "@/features/reporting/server/render-report-card-html-with-school-font";
import { renderReportCardPdfWithSchoolFont } from "@/features/reporting/server/render-report-card-pdf-with-school-font";
import { REPORT_CARD_RENDERER_VERSION } from "@/features/reporting/server/report-card-renderer-version";
import { record, text } from "@/features/reporting/server/report-card-template-model";

type RenderFormat = "html" | "pdf";
type RenderJob = {
  id: string;
  school_id: string;
  snapshot_id: string;
  template_key: string;
  template_version: string;
  renderer_version: string;
  document_format: RenderFormat;
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

async function loadFrozenSchoolLogo(supabase: ReturnType<typeof createSupabaseAdminClient>, dataSnapshot: unknown): Promise<Uint8Array | null> {
  const snapshot = record(dataSnapshot);
  const profile = record(snapshot.school_document_profile);
  const storagePath = text(profile.logo_storage_path);
  if (!storagePath) return null;

  const { data, error } = await supabase.storage.from("school-document-assets").download(storagePath);
  if (error || !data) throw new Error(`Unable to load frozen school logo asset: ${error?.message ?? "asset not found"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function processReportCardRenderQueue(limit = 20): Promise<ReportCardRenderWorkerResult> {
  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();

  const { data: recovered, error: recoveryError } = await supabase.rpc("recover_stale_report_card_render_jobs", {
    p_stale_after_seconds: 900,
    p_retry_after_seconds: 300,
    p_max_attempts: 5,
  });
  if (recoveryError) throw new Error(`Unable to recover stale render jobs: ${recoveryError.message}`);

  const perFormatLimit = Math.max(1, Math.floor(limit / 2));
  const [htmlClaim, pdfClaim] = await Promise.all([
    supabase.rpc("claim_report_card_render_jobs", { p_limit: perFormatLimit, p_document_format: "html" }),
    supabase.rpc("claim_report_card_render_jobs", { p_limit: perFormatLimit, p_document_format: "pdf" }),
  ]);
  if (htmlClaim.error) throw new Error(`Unable to claim HTML render jobs: ${htmlClaim.error.message}`);
  if (pdfClaim.error) throw new Error(`Unable to claim PDF render jobs: ${pdfClaim.error.message}`);

  const jobs = [...((htmlClaim.data ?? []) as RenderJob[]), ...((pdfClaim.data ?? []) as RenderJob[])];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      if (job.renderer_version !== REPORT_CARD_RENDERER_VERSION) {
        throw new Error(`Unsupported report-card renderer revision ${job.renderer_version}`);
      }

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

      const renderInput = {
        schoolName: school.name,
        schoolEmisNumber: school.emis_number,
        snapshotVersion: snapshot.snapshot_version,
        certifiedAt: snapshot.certified_at,
        dataSnapshot: snapshot.data_snapshot ?? {},
        logoBytes: await loadFrozenSchoolLogo(supabase, snapshot.data_snapshot),
      };

      let bytes: Uint8Array;
      let pageCount: number | null = null;
      let extension: RenderFormat;
      let contentType: string;

      if (job.document_format === "pdf") {
        const rendered = await renderReportCardPdfWithSchoolFont(renderInput);
        bytes = rendered.bytes;
        pageCount = rendered.pageCount;
        extension = "pdf";
        contentType = "application/pdf";
      } else {
        bytes = new TextEncoder().encode(await renderReportCardHtmlWithSchoolFont(renderInput));
        extension = "html";
        contentType = "text/html; charset=utf-8";
      }

      const checksum = createHash("sha256").update(bytes).digest("hex");
      const storagePath = `${job.school_id}/${job.snapshot_id}/${job.template_key}/${job.template_version}/${job.renderer_version}.${extension}`;

      const { error: uploadError } = await supabase.storage.from("report-card-artifacts").upload(storagePath, bytes, {
        contentType,
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);

      const { error: completeError } = await supabase.rpc("complete_report_card_render_job", {
        p_job_id: job.id,
        p_storage_bucket: "report-card-artifacts",
        p_storage_path: storagePath,
        p_content_sha256: checksum,
        p_page_count: pageCount,
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
    .eq("renderer_version", REPORT_CARD_RENDERER_VERSION)
    .in("document_format", ["html", "pdf"])
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
