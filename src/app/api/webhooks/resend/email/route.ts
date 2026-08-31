import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parseResendEmailWebhook,
  verifyResendWebhookSignature,
} from "@/features/communications/server/resend-email-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();

  let providerEventId: string;
  try {
    providerEventId = verifyResendWebhookSignature(rawBody, request.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Resend webhook verification error";
    console.warn("resend email webhook rejected", message);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const event = parseResendEmailWebhook(rawBody, providerEventId);
    if (event.kind === "ignored") {
      return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("record_communication_delivery_receipt", {
      p_provider_key: "resend_email",
      p_provider_message_id: event.receipt.providerMessageId,
      p_outcome: event.receipt.outcome,
      p_provider_event_id: event.receipt.providerEventId,
      p_occurred_at: event.receipt.occurredAt,
      p_error_code: event.receipt.errorCode,
      p_error_detail: event.receipt.errorDetail,
      p_provider_metadata: event.receipt.providerMetadata,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ receiptId: data }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Resend email webhook error";
    console.error("resend email webhook processing failed", message);
    return NextResponse.json({ error: "Unable to process Resend email event" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
