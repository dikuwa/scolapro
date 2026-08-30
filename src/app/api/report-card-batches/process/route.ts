import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth/get-user-context";
import { processReportCardBatchExportQueue } from "@/features/reporting/server/process-report-card-batch-export-queue";
import { processReportCardBatchQueue } from "@/features/reporting/server/process-report-card-batch-queue";
import { processReportCardRenderQueue } from "@/features/reporting/server/process-report-card-render-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export async function POST() {
  const context = await getUserContext();
  if (!context.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!context.memberships.some((membership) => managerRoles.has(membership.roleKey))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const batch = await processReportCardBatchQueue(100);
    const render = await processReportCardRenderQueue(40);
    const exportResult = await processReportCardBatchExportQueue(1);
    return NextResponse.json({ batch, render, export: exportResult }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report-card worker error";
    console.error("authenticated report-card worker pulse failed", message);
    return NextResponse.json({ error: "Unable to process report-card work" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
