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

type SchoolRow = {
  id: string;
  name: string;
  emis_number: string | null;
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

const MAX_RENDER_CLAIM = 12;
const RENDER_CONCURRENCY = 4;

async function loadFrozenSchoolLogo(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  dataSnapshot: unknown,
  cache: Map<string, Promise<Uint8Array | null>>,
): Promise<Uint8Array | null> {
  const snapshot = record(dataSnapshot);
  const profile = record(snapshot.school_document_profile);
  const storagePath = text(profile.logo_storage_path);
  if (!storagePath) return null;

  const cached = cache.get(storagePath);
  if (cached) return cached;

  const load = (async () => {
    const { data, error } = await supabase.storage.from("school-document-assets").download(storagePath);
    if (error || !data) throw new Error(`Unable to load frozen school logo asset: ${error?.message ?? "asset not found"}`);
    return new Uint8Array(await data.arrayBuffer());
  })();
  cache.set(storagePath, load);
  return load;
}

async function loadSchool(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  schoolId: string,
  cache: Map<string, Promise<SchoolRow>>,
): Promise<SchoolRow> {
  const cached = cache.get(schoolId);
  if (cached) return cached;

  const load = (async () => {
    const { data, error } = await supabase.from("schools").select("id,name,emis_number").eq("id", schoolId).single();
    if (error || !data) throw new Error(error?.message ?? "School not found");
    return data as SchoolRow;
  })();
  cache.set(schoolId, load);
  return load;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
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

  // Keep each invocation bounded so one serverless request cannot claim a large
  // queue and strand it in "processing". Independent workers can safely scale
  // horizontally because the claim RPC uses FOR UPDATE SKIP LOCKED.
  const claimLimit = Math.max(1, Math.min(limit, MAX_RENDER_CLAIM));
  const htmlLimit = Math.ceil(claimLimit / 2);
  const pdfLimit = Math.floor(claimLimit / 2);
  const [htmlClaim, pdfClaim] = await Promise.all([
    htmlLimit > 0
      ? supabase.rpc("claim_report_card_render_jobs", { p_limit: htmlLimit, p_document_format: "html" })
      : Promise.resolve({ data: [], error: null }),
    pdfLimit > 0
      ? supabase.rpc("claim_report_card_render_jobs", { p_limit: pdfLimit, p_document_format: "pdf" })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (htmlClaim.error) throw new Error(`Unable to claim HTML render jobs: ${htmlClaim.error.message}`);
  if (pdfClaim.error) throw new Error(`Unable to claim PDF render jobs: ${pdfClaim.error.message}`);

  const jobs = [...((htmlClaim.data ?? []) as RenderJob[]), ...((pdfClaim.data ?? []) as RenderJob[])];
  const schoolCache = new Map<string, Promise<SchoolRow>>();
  const logoCache = new Map<string, Promise<Uint8Array | null>>();
  let completed = 0;
  let failed = 0;

  await runWithConcurrency(jobs, RENDER_CONCURRENCY, async (job) => {
    try {
      if (job.renderer_version !== REPORT_CARD_RENDERER_VERSION) {
        throw new Error(`Unsupported report-card renderer revision ${job.renderer_version}`);
      }

      const [{ data: snapshot, error: snapshotError }, school] = await Promise.all([
        supabase
          .from("report_card_snapshots")
          .select("id,school_id,snapshot_version,data_snapshot,generated_at,certified_at")
          .eq("id", job.snapshot_id)
          .single(),
        loadSchool(supabase, job.school_id, schoolCache),
      ]);

      if (snapshotError || !snapshot) throw new Error(snapshotError?.message ?? "Report-card snapshot not found");

      const renderInput = {
        schoolName: school.name,
        schoolEmisNumber: school.emis_number,
        snapshotVersion: snapshot.snapshot_version,
        generatedAt: snapshot.generated_at,
        certifiedAt: snapshot.certified_at,
        dataSnapshot: snapshot.data_snapshot ?? {},
        logoBytes: await loadFrozenSchoolLogo(supabase, snapshot.data_snapshot, logoCache),
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
  });

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
