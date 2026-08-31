import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const BIRD_WEBHOOK_TOLERANCE_SECONDS = 300;
const BIRD_WEBHOOK_MAX_BYTES = 256 * 1024;

export type BirdSmsTerminalReceipt = {
  providerMessageId: string;
  providerEventId: string;
  outcome: "delivered" | "failed";
  occurredAt: string;
  errorCode: string | null;
  errorDetail: string | null;
  providerMetadata: Record<string, string>;
};

export type BirdSmsWebhookResult =
  | { kind: "ignored"; eventType: string }
  | { kind: "terminal"; receipt: BirdSmsTerminalReceipt };

type BirdSmsEventData = {
  sms_id?: unknown;
  to?: unknown;
  from?: unknown;
  carrier?: unknown;
  mcc_mnc?: unknown;
  error?: {
    code?: unknown;
    description?: unknown;
    carrier_error_code?: unknown;
  } | null;
};

type BirdSmsEvent = {
  type?: unknown;
  timestamp?: unknown;
  data?: BirdSmsEventData | null;
};

function requiredWebhookSecret(): string {
  const secret = process.env.BIRD_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("BIRD_WEBHOOK_SECRET is not configured.");
  if (!secret.startsWith("whsec_")) throw new Error("BIRD_WEBHOOK_SECRET must use the Bird whsec_ format.");
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

export function verifyBirdWebhookSignature(rawBody: string, headers: Headers): string {
  if (Buffer.byteLength(rawBody, "utf8") > BIRD_WEBHOOK_MAX_BYTES) {
    throw new Error("Bird webhook payload is too large.");
  }

  const webhookId = nonEmptyString(headers.get("webhook-id"));
  const timestampHeader = nonEmptyString(headers.get("webhook-timestamp"));
  const signatureHeader = nonEmptyString(headers.get("webhook-signature"));
  if (!webhookId || !timestampHeader || !signatureHeader) {
    throw new Error("Bird webhook signature headers are incomplete.");
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error("Bird webhook timestamp is invalid.");
  if (Math.abs(Date.now() / 1000 - timestamp) > BIRD_WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Bird webhook timestamp is outside the accepted replay window.");
  }

  const secret = requiredWebhookSecret();
  let key: Buffer;
  try {
    key = Buffer.from(secret.slice("whsec_".length), "base64");
  } catch {
    throw new Error("BIRD_WEBHOOK_SECRET is invalid.");
  }
  if (key.length === 0) throw new Error("BIRD_WEBHOOK_SECRET is invalid.");

  const expected = createHmac("sha256", key)
    .update(`${webhookId}.${timestampHeader}.${rawBody}`)
    .digest();

  const matched = signatureHeader.split(/\s+/).some((part) => {
    if (!part.startsWith("v1,")) return false;
    return safeEqualBase64(part.slice(3), expected);
  });
  if (!matched) throw new Error("Bird webhook signature verification failed.");

  return webhookId;
}

function terminalOutcome(eventType: string): "delivered" | "failed" | null {
  if (eventType === "sms.delivered") return "delivered";
  if (
    eventType === "sms.undelivered" ||
    eventType === "sms.failed" ||
    eventType === "sms.expired" ||
    eventType === "sms.rejected"
  ) {
    return "failed";
  }
  return null;
}

function metadataValue(value: unknown): string | null {
  const text = nonEmptyString(value);
  return text ? text.slice(0, 250) : null;
}

export function parseBirdSmsWebhook(rawBody: string, providerEventId: string): BirdSmsWebhookResult {
  let payload: BirdSmsEvent;
  try {
    payload = JSON.parse(rawBody) as BirdSmsEvent;
  } catch {
    throw new Error("Bird webhook body is not valid JSON.");
  }

  const eventType = nonEmptyString(payload.type);
  if (!eventType) throw new Error("Bird webhook event type is required.");

  const outcome = terminalOutcome(eventType);
  if (!outcome) return { kind: "ignored", eventType };

  const providerMessageId = nonEmptyString(payload.data?.sms_id);
  if (!providerMessageId) throw new Error("Bird terminal SMS event is missing data.sms_id.");

  const timestampText = nonEmptyString(payload.timestamp);
  if (!timestampText || Number.isNaN(Date.parse(timestampText))) {
    throw new Error("Bird terminal SMS event timestamp is invalid.");
  }

  const errorCode = nonEmptyString(payload.data?.error?.code);
  const errorDetail = nonEmptyString(payload.data?.error?.description);
  const metadata: Record<string, string> = { event_type: eventType };
  const to = metadataValue(payload.data?.to);
  const from = metadataValue(payload.data?.from);
  const carrier = metadataValue(payload.data?.carrier);
  const mccMnc = metadataValue(payload.data?.mcc_mnc);
  const carrierErrorCode = metadataValue(payload.data?.error?.carrier_error_code);
  if (to) metadata.to = to;
  if (from) metadata.from = from;
  if (carrier) metadata.carrier = carrier;
  if (mccMnc) metadata.mcc_mnc = mccMnc;
  if (carrierErrorCode) metadata.carrier_error_code = carrierErrorCode;

  return {
    kind: "terminal",
    receipt: {
      providerMessageId,
      providerEventId,
      outcome,
      occurredAt: new Date(timestampText).toISOString(),
      errorCode,
      errorDetail,
      providerMetadata: metadata,
    },
  };
}
