import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function authorizedReceiptIngest(request: Request): boolean {
  const expected = process.env.COMMUNICATION_RECEIPT_INGEST_SECRET;
  return Boolean(expected && bearerToken(request) === expected);
}

type ReceiptPayload = {
  providerKey?: unknown;
  providerMessageId?: unknown;
  outcome?: unknown;
  providerEventId?: unknown;
  occurredAt?: unknown;
  errorCode?: unknown;
  errorDetail?: unknown;
  providerMetadata?: unknown;
};

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("providerMetadata must be a JSON object");
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!authorizedReceiptIngest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ReceiptPayload;
    const providerKey = optionalString(body.providerKey);
    const providerMessageId = optionalString(body.providerMessageId);
    const providerEventId = optionalString(body.providerEventId);
    const errorCode = optionalString(body.errorCode);
    const errorDetail = optionalString(body.errorDetail);
    const metadata = metadataObject(body.providerMetadata);
    const outcome = body.outcome === "delivered" || body.outcome === "failed" ? body.outcome : null;

    if (!providerKey || !providerMessageId || !outcome) {
      return NextResponse.json(
        { error: "providerKey, providerMessageId and outcome (delivered|failed) are required" },
        { status: 400 },
      );
    }

    let occurredAt: string | null = null;
    if (body.occurredAt != null) {
      if (typeof body.occurredAt !== "string" || Number.isNaN(Date.parse(body.occurredAt))) {
        return NextResponse.json({ error: "occurredAt must be an ISO date-time string" }, { status: 400 });
      }
      occurredAt = new Date(body.occurredAt).toISOString();
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("record_communication_delivery_receipt", {
      p_provider_key: providerKey,
      p_provider_message_id: providerMessageId,
      p_outcome: outcome,
      p_provider_event_id: providerEventId,
      p_occurred_at: occurredAt,
      p_error_code: errorCode,
      p_error_detail: errorDetail,
      p_provider_metadata: metadata,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ receiptId: data }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown receipt ingestion error";
    console.error("communication receipt ingestion failed", message);
    return NextResponse.json({ error: "Unable to record delivery receipt" }, { status: 400 });
  }
}
