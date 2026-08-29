import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderReportCardHtml } from "@/features/reporting/server/render-report-card-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenderJob = {
  id: string;
  school_id: string;
  snapshot_id: string;
  template_key: string;
  template_version: string;
  document_format: "html";
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function authorizedInternalRunner(request: Request): boolean {
  const expected = process.env.INTERNAL_JOB_RUNNER_SECRET;
  return Boolean(expected && bearerToken(request) === expected);
}

function authorizedScheduler(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && bearerToken(request) === expected);
}

async function runRenderWorker() {
  const supabase = createSupabaseAdminClient();

  const { data: recovered, error: recoveryError } = await supabase.rpc("recover_stale_report_card_render_jobs", {
    p_stale_after_seconds: 900,
    p_retry_after_seconds: 300,
    p_max_attempts: 5,
  });
  if (recoveryError) {
    console.error("report-card-render recovery failed", recoveryError.message);
    return NextResponse.json({ error: "Unable to recover stale render jobs" }, { status: 500 });
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_report_card_render_jobs", {
    p_limit: 10,
    p_document_format: "html",
  });

  if (claimError) {
    console.error("report-card-render claim failed", claimError.message);
    return NextResponse.json({ error: "Unable to claim render jobs" }, { status: 500 });
  }

  const jobs = (claimed ?? []) as RenderJob[];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const [{ data: snapshot, error: snapshotError }, { data: school, error: schoolError }] = await Promise.all([
        supabase
          .from("report_card_snapshots")
          .select("id, school_id, snapshot_version, data_snapshot, certified_at")
          .eq("id", job.snapshot_id)
          .single(),
        supabase.from("schools").select("id, name, emis_number").eq("id", job.school_id).single(),
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
      await supabase.rpc("fail_report_card_render_job", {
        p_job_id: job.id,
        p_error: message,
        p_retry_after_seconds: 300,
        p_max_attempts: 5,
      });
    }
  }

  return NextResponse.json({ recovered: Number(recovered ?? 0), claimed: jobs.length, completed, failed });
}

export async function POST(request: Request) {
  if (!authorizedInternalRunner(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runRenderWorker();
}

export async function GET(request: Request) {
  if (!authorizedScheduler(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runRenderWorker();
}
