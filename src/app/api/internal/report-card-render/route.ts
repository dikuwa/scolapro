import { NextResponse } from "next/server";
import { processReportCardBatchQueue } from "@/features/reporting/server/process-report-card-batch-queue";
import { processReportCardRenderQueue } from "@/features/reporting/server/process-report-card-render-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

async function runWorkerResponse() {
  try {
    // Process durable generation/certification/PDF-preparation batches first. A PDF
    // batch may enqueue render jobs, which are then picked up in the same invocation.
    const batch = await processReportCardBatchQueue(50);
    const render = await processReportCardRenderQueue(20);
    return NextResponse.json({ batch, render }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report-card worker error";
    console.error("report-card worker failed", message);
    return NextResponse.json({ error: "Unable to process report-card queues" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!authorizedInternalRunner(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runWorkerResponse();
}

export async function GET(request: Request) {
  if (!authorizedScheduler(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runWorkerResponse();
}
