import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { REPORT_CARD_RENDERER_VERSION } from "@/features/reporting/server/report-card-renderer-version";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ExportBatch = {
  id: string;
  school_id: string;
  term_number: number;
  total_items: number;
  completed_items: number;
};

type BatchItem = {
  enrolment_id: string;
  snapshot_id: string | null;
  status: "pending" | "processing" | "completed" | "skipped" | "failed";
};

type ReportDocument = {
  snapshot_id: string;
  storage_bucket: string;
  storage_path: string;
};

export type ReportCardBatchExportWorkerResult = {
  claimed: number;
  completed: number;
  failed: number;
  durationMs: number;
};

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function processReportCardBatchExportQueue(limit = 1): Promise<ReportCardBatchExportWorkerResult> {
  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_report_card_batch_exports", {
    p_limit: Math.max(1, Math.min(limit, 3)),
  });
  if (error) throw new Error(`Unable to claim report-card batch exports: ${error.message}`);

  const batches = (data ?? []) as ExportBatch[];
  let completed = 0;
  let failed = 0;

  for (const batch of batches) {
    try {
      // Defense in depth: the claim RPC is the primary readiness boundary, but
      // never assemble a combined artifact from an internally inconsistent or
      // still-active batch if state changes between claim and worker execution.
      const { data: itemData, error: itemError } = await supabase
        .from("report_card_batch_items")
        .select("enrolment_id,snapshot_id,status")
        .eq("batch_id", batch.id);
      if (itemError) throw new Error(itemError.message);

      const allItems = (itemData ?? []) as BatchItem[];
      if (allItems.length !== batch.total_items) {
        throw new Error(`Batch item count changed after export claim (${allItems.length}/${batch.total_items})`);
      }
      if (allItems.some((item) => item.status === "pending" || item.status === "processing")) {
        throw new Error("Report-card batch still has active learner work after export claim");
      }

      const items = allItems.filter((item) => item.status === "completed");
      if (items.length !== batch.completed_items) {
        throw new Error(`Completed batch item count changed after export claim (${items.length}/${batch.completed_items})`);
      }
      if (!items.length) throw new Error("No completed learner reports are available for this batch export");
      if (items.some((item) => !item.snapshot_id)) throw new Error("A completed batch item is missing its report snapshot");

      const enrolmentIds = items.map((item) => item.enrolment_id);
      const snapshotIds = items.map((item) => item.snapshot_id as string);
      const [{ data: enrolmentData, error: enrolmentError }, { data: documentData, error: documentError }] = await Promise.all([
        supabase
          .from("enrolments")
          .select("id,admission_number,learners(first_names,surname)")
          .in("id", enrolmentIds),
        supabase
          .from("report_card_documents")
          .select("snapshot_id,storage_bucket,storage_path")
          .in("snapshot_id", snapshotIds)
          .eq("template_key", "TERM_REPORT")
          .eq("renderer_version", REPORT_CARD_RENDERER_VERSION)
          .eq("document_format", "pdf")
          .eq("status", "ready"),
      ]);
      if (enrolmentError) throw new Error(enrolmentError.message);
      if (documentError) throw new Error(documentError.message);

      const documentBySnapshot = new Map(((documentData ?? []) as ReportDocument[]).map((document) => [document.snapshot_id, document]));
      if (documentBySnapshot.size !== snapshotIds.length) {
        const missing = snapshotIds.filter((snapshotId) => !documentBySnapshot.has(snapshotId));
        throw new Error(`Current PDF artifacts are not ready for ${missing.length} completed learner report(s)`);
      }

      const enrolmentOrder = new Map((enrolmentData ?? []).map((enrolment) => {
        const learner = one(enrolment.learners);
        const surname = learner?.surname?.trim() ?? "";
        const firstNames = learner?.first_names?.trim() ?? "";
        const admissionNumber = enrolment.admission_number?.trim() ?? "";
        return [enrolment.id, `${surname}\u0000${firstNames}\u0000${admissionNumber}\u0000${enrolment.id}`];
      }));

      const orderedItems = [...items].sort((a, b) =>
        (enrolmentOrder.get(a.enrolment_id) ?? a.enrolment_id).localeCompare(
          enrolmentOrder.get(b.enrolment_id) ?? b.enrolment_id,
          "en",
          { numeric: true, sensitivity: "base" },
        ),
      );
      const merged = await PDFDocument.create();

      for (const item of orderedItems) {
        const snapshotId = item.snapshot_id as string;
        const document = documentBySnapshot.get(snapshotId);
        if (!document) throw new Error(`Current PDF artifact is not ready for snapshot ${snapshotId}`);
        if (document.storage_bucket !== "report-card-artifacts") throw new Error("Unexpected report-card artifact bucket");

        const { data: blob, error: downloadError } = await supabase.storage
          .from("report-card-artifacts")
          .download(document.storage_path);
        if (downloadError || !blob) throw new Error(downloadError?.message ?? "Unable to download learner PDF artifact");
        const source = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const page of pages) merged.addPage(page);
      }

      if (!merged.getPageCount()) throw new Error("Combined PDF contains no pages");
      const bytes = await merged.save();
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const storagePath = `${batch.school_id}/batches/${batch.id}/${REPORT_CARD_RENDERER_VERSION}/term-${batch.term_number}-combined.pdf`;
      const { error: uploadError } = await supabase.storage.from("report-card-artifacts").upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);

      const { error: completeError } = await supabase.rpc("complete_report_card_batch_export", {
        p_batch_id: batch.id,
        p_storage_bucket: "report-card-artifacts",
        p_storage_path: storagePath,
        p_content_sha256: checksum,
        p_page_count: merged.getPageCount(),
      });
      if (completeError) throw new Error(completeError.message);
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown combined report-card export error";
      console.error("report-card batch export failed", batch.id, message);
      const { error: failError } = await supabase.rpc("fail_report_card_batch_export", {
        p_batch_id: batch.id,
        p_error: message,
      });
      if (failError) console.error("report-card batch export failure state update failed", batch.id, failError.message);
    }
  }

  return { claimed: batches.length, completed, failed, durationMs: Date.now() - startedAt };
}
