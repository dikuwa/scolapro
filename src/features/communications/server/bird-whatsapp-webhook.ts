import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const BIRD_WEBHOOK_TOLERANCE_SECONDS = 300;
const BIRD_WEBHOOK_MAX_BYTES = 256 * 1024;

export type BirdWhatsAppTerminalReceipt = {
  providerMessageId: string;
  providerEventId: string;
  outcome: "delivered" | "failed";
  occurredAt: string;
  errorCode: string | null;
  errorDetail: string | null;
  providerMetadata: Record<string, string>;
};

export type BirdWhatsAppWebhookResult =
  | { kind: "ignored"; eventType: string }
  | { kind: "terminal"; receipt: BirdWhatsAppTerminalReceipt };

type BirdWhatsAppEvent = {
  type?: unknown;
  timestamp?: unknown;
  data?: {
    whatsapp_id?: unknown;
    workspace_id?: unknown;
    direction?: unknown;
    error?: {
      code?: unknown;
      description?: unknown;
      meta_error_code?: unknown;
    } | null;
  } | null;
};

function requiredWebhookSecret(): string {
  const secret = process.env.BIRD_WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("BIRD_WHATSAPP_WEBHOOK_SECRET is not configured.");
  if (!secret.startsWith("whsec_")) throw new Error("BIRD_WHATSAPP_WEBHOOK_SECRET must use the Bird whsec_ format.");
  return secret;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeEqualBase64(candidate: string, expected: Buffer): boolean {
  try {
    const actual = Buffer.from(candidate, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function verifyBirdWhatsAppWebhookSignature(rawBody: string, headers: Headers): string {
  if (Buffer.byteLength(rawBody, "utf8") > BIRD_WEBHOOK_MAX_BYTES) {
    throw new Error("Bird WhatsApp webhook payload is too large.");
  }

  const webhookId = nonEmptyString(headers.get("webhook-id"));
  const timestampHeader = nonEmptyString(headers.get("webhook-timestamp"));
  const signatureHeader = nonEmptyString(headers.get("webhook-signature"));
  if (!webhookId || !timestampHeader || !signatureHeader) {
    throw new Error("Bird WhatsApp webhook signature headers are incomplete.");
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error("Bird WhatsApp webhook timestamp is invalid.");
  if (Math.abs(Date.now() / 1000 - timestamp) > BIRD_WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Bird WhatsApp webhook timestamp is outside the accepted replay window.");
  }

  let key: Buffer;
  try {
    key = Buffer.from(requiredWebhookSecret().slice("whsec_".length), "base64");
  } catch {
    throw new Error("BIRD_WHATSAPP_WEBHOOK_SECRET is invalid.");
  }
  if (key.length === 0) throw new Error("BIRD_WHATSAPP_WEBHOOK_SECRET is invalid.");

  const expected = createHmac("sha256", key)
    .update(`${webhookId}.${timestampHeader}.${rawBody}`)
    .digest();
  const matched = signatureHeader.split(/\s+/).some((part) => {
    if (!part.startsWith("v1,")) return false;
    return safeEqualBase64(part.slice(3), expected);
  });
  if (!matched) throw new Error("Bird WhatsApp webhook signature verification failed.");
  return webhookId;
}

function terminalOutcome(eventType: string): "delivered" | "failed" | null {
  if (eventType === "whatsapp.delivered") return "delivered";
  if (eventType === "whatsapp.failed" || eventType === "whatsapp.rejected") return "failed";
  return null;
}

function metadataValue(value: unknown): string | null {
  const text = nonEmptyString(value);
  return text ? text.slice(0, 250) : null;
}

export function parseBirdWhatsAppWebhook(rawBody: string, providerEventId: string): BirdWhatsAppWebhookResult {
  let payload: BirdWhatsAppEvent;
  try {
    payload = JSON.parse(rawBody) as BirdWhatsAppEvent;
  } catch {
    throw new Error("Bird WhatsApp webhook body is not valid JSON.");
  }

  const eventType = nonEmptyString(payload.type);
  if (!eventType) throw new Error("Bird WhatsApp webhook event type is required.");

  const outcome = terminalOutcome(eventType);
  if (!outcome) return { kind: "ignored", eventType };

  const providerMessageId = nonEmptyString(payload.data?.whatsapp_id);
  if (!providerMessageId) throw new Error("Bird terminal WhatsApp event is missing data.whatsapp_id.");

  const timestampText = nonEmptyString(payload.timestamp);
  if (!timestampText || Number.isNaN(Date.parse(timestampText))) {
    throw new Error("Bird terminal WhatsApp event timestamp is invalid.");
  }

  const metadata: Record<string, string> = { event_type: eventType };
  const workspaceId = metadataValue(payload.data?.workspace_id);
  const direction = metadataValue(payload.data?.direction);
  const metaErrorCode = metadataValue(payload.data?.error?.meta_error_code);
  if (workspaceId) metadata.workspace_id = workspaceId;
  if (direction) metadata.direction = direction;
  if (metaErrorCode) metadata.meta_error_code = metaErrorCode;

  return {
    kind: "terminal",
    receipt: {
      providerMessageId,
      providerEventId,
      outcome,
      occurredAt: new Date(timestampText).toISOString(),
      errorCode: nonEmptyString(payload.data?.error?.code),
      errorDetail: nonEmptyString(payload.data?.error?.description),
      providerMetadata: metadata,
    },
  };
}
