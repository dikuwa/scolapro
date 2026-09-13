import type { ReportCardBatchRow } from "./server/report-cards";

// Progress dismissal is local presentation only. Batch rows and their outcomes,
// artifacts and audit provenance remain authoritative and are never mutated.
export function canHideReportBatch(batch: Pick<ReportCardBatchRow, "status" | "exportStatus">) {
  return ["completed", "partial", "cancelled"].includes(batch.status)
    && ["not_applicable", "ready", "failed"].includes(batch.exportStatus);
}
