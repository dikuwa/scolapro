import { NextResponse } from "next/server";
import { processReportCardBatchExportQueue } from "@/features/reporting/server/process-report-card-batch-export-queue";
import { processReportCardBatchQueue } from "@/features/reporting/server/process-report-card-batch-queue";
import {
  processReportCardRenderQueue,
  type ReportCardRenderWorkerResult,
} from "@/features/reporting/server/process-report-card-render-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RENDER_QUEUE_LIMIT = 20;
const MAX_RENDER_DRAIN_PASSES = 4;
const RENDER_DRAIN_DEADLINE_MS = 40_000;

type ReportCardRenderDrainResult = ReportCardRenderWorkerResult & {
  passes: number;
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

async function drainReportCardRenderQueue(workerStartedAt: number): Promise<ReportCardRenderDrainResult> {
  let aggregate: ReportCardRenderDrainResult | null = null;
  let previousPassDurationMs = 0;

  for (let pass = 0; pass < MAX_RENDER_DRAIN_PASSES; pass += 1) {
    // Preserve one render pass on every invocation. Additional passes are only
    // attempted when the previous pass completed quickly enough to leave a
    // conservative reserve for the combined-export worker inside maxDuration.
    if (
      pass > 0 &&
      Date.now() - workerStartedAt + Math.max(previousPassDurationMs, 1_000) >= RENDER_DRAIN_DEADLINE_MS
    ) {
      break;
    }

    const result = await processReportCardRenderQueue(RENDER_QUEUE_LIMIT);
    previousPassDurationMs = result.durationMs;

    if (!aggregate) {
      aggregate = { ...result, passes: 1 };
    } else {
      aggregate = {
        recovered: aggregate.recovered + result.recovered,
        claimed: aggregate.claimed + result.claimed,
        completed: aggregate.completed + result.completed,
        failed: aggregate.failed + result.failed,
        pending: result.pending,
        retrying: result.retrying,
        dead: result.dead,
        durationMs: aggregate.durationMs + result.durationMs,
        passes: aggregate.passes + 1,
      };
    }

    if (result.claimed === 0 || (result.pending === 0 && result.retrying === 0)) {
      break;
    }
  }

  // MAX_RENDER_DRAIN_PASSES is always at least one, so this is defensive only.
  if (!aggregate) {
    return {
      recovered: 0,
      claimed: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      retrying: 0,
      dead: 0,
      durationMs: 0,
      passes: 0,
    };
  }

  return aggregate;
}

async function runWorkerResponse() {
  const workerStartedAt = Date.now();

  try {
    // Process durable generation/certification/PDF-preparation batches first. PDF
    // preparation may enqueue more learner renders than one worker claim can hold,
    // so drain bounded render passes before asking the export worker to combine
    // learner PDFs. The deadline guard keeps a reserve inside the 60-second route.
    const batch = await processReportCardBatchQueue(50);
    const render = await drainReportCardRenderQueue(workerStartedAt);
    const exportResult = await processReportCardBatchExportQueue(1);
    return NextResponse.json({ batch, render, export: exportResult }, { headers: { "Cache-Control": "no-store" } });
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
