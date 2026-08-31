import { NextResponse } from "next/server";
import { processCommunicationDeliveryQueue } from "@/features/communications/server/process-communication-delivery-queue";

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
    const result = await processCommunicationDeliveryQueue(25);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown communication worker error";
    console.error("communication delivery worker failed", message);
    return NextResponse.json(
      { error: "Unable to process communication delivery queue" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
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
