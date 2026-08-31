import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const RESEND_WEBHOOK_TOLERANCE_SECONDS = 300;
const RESEND_WEBHOOK_MAX_BYTES = 256 * 1024;

export type ResendEmailTerminalReceipt = {
  providerMessageId: string;
  providerEventId: string;
  outcome: "delivered" | "failed";
  occurredAt: string;
  errorCode: string | null;
  errorDetail: string | null;
  providerMetadata: Record<string, string>;
};

export type ResendEmailWebhookResult =
  | { kind: "ignored"; eventType: string }
  | { kind: "terminal"; receipt: ResendEmailTerminalReceipt };

type ResendEmailEventData = {
  email_id?: unknown;
  bounce?: {
    message?: unknown;
    type?: unknown;
    subType?: unknown;
  } | null;
  failed?: {
    reason?: unknown;
  } | null;
  suppressed?: {
    message?: unknown;
    type?: unknown;
  } | null;
};

type ResendEmailEvent = {
  type?: unknown;
  created_at?: unknown;
  data?: ResendEmailEventData | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredWebhookSecret(): string {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not configured.");
  if (!secret.startsWith("whsec_")) throw new Error("RESEND_WEBHOOK_SECRET must use the whsec_ format.");
  return secret;
}

function safeEqualBase64(candidate: string, expected: Buffer): boolean {
  try {
    const actual = Buffer.from(candidate, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function verifyResendWebhookSignature(rawBody: string, headers: Headers): string {
  if (Buffer.byteLength(rawBody, "utf8") > RESEND_WEBHOOK_MAX_BYTES) {
    throw new Error("Resend webhook payload is too large.");
  }

  const eventId = nonEmptyString(headers.get("svix-id"));
  const timestampHeader = nonEmptyString(headers.get("svix-timestamp"));
  const signatureHeader = nonEmptyString(headers.get("svix-signature"));
  if (!eventId || !timestampHeader || !signatureHeader) {
    throw new Error("Resend webhook signature headers are incomplete.");
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error("Resend webhook timestamp is invalid.");
  if (Math.abs(Date.now() / 1000 - timestamp) > RESEND_WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Resend webhook timestamp is outside the accepted replay window.");
  }

  const secret = requiredWebhookSecret();
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  if (key.length === 0) throw new Error("RESEND_WEBHOOK_SECRET is invalid.");

  const expected = createHmac("sha256", key)
    .update(`${eventId}.${timestampHeader}.${rawBody}`)
    .digest();

  const matched = signatureHeader.split(/\s+/).some((part) => {
    if (!part.startsWith("v1,")) return false;
    return safeEqualBase64(part.slice(3), expected);
  });
  if (!matched) throw new Error("Resend webhook signature verification failed.");

  return eventId;
}

function terminalOutcome(eventType: string): "delivered" | "failed" | null {
  if (eventType === "email.delivered") return "delivered";
  if (eventType === "email.bounced" || eventType === "email.failed" || eventType === "email.suppressed") {
    return "failed";
  }
  return null;
}

function metadataValue(value: unknown): string | null {
  const text = nonEmptyString(value);
  return text ? text.slice(0, 250) : null;
}

export function parseResendEmailWebhook(rawBody: string, providerEventId: string): ResendEmailWebhookResult {
  let payload: ResendEmailEvent;
  try {
    payload = JSON.parse(rawBody) as ResendEmailEvent;
  } catch {
    throw new Error("Resend webhook body is not valid JSON.");
  }

  const eventType = nonEmptyString(payload.type);
  if (!eventType) throw new Error("Resend webhook event type is required.");

  const outcome = terminalOutcome(eventType);
  if (!outcome) return { kind: "ignored", eventType };

  const providerMessageId = nonEmptyString(payload.data?.email_id);
  if (!providerMessageId) throw new Error("Resend terminal email event is missing data.email_id.");

  const timestampText = nonEmptyString(payload.created_at);
  if (!timestampText || Number.isNaN(Date.parse(timestampText))) {
    throw new Error("Resend terminal email event timestamp is invalid.");
  }

  const metadata: Record<string, string> = { event_type: eventType };
  let errorCode: string | null = null;
  let errorDetail: string | null = null;

  if (eventType === "email.bounced") {
    errorCode = metadataValue(payload.data?.bounce?.type) ?? "bounced";
    errorDetail = nonEmptyString(payload.data?.bounce?.message);
    const bounceSubType = metadataValue(payload.data?.bounce?.subType);
    if (bounceSubType) metadata.bounce_subtype = bounceSubType;
  } else if (eventType === "email.failed") {
    errorCode = metadataValue(payload.data?.failed?.reason) ?? "failed";
    errorDetail = errorCode;
  } else if (eventType === "email.suppressed") {
    errorCode = metadataValue(payload.data?.suppressed?.type) ?? "suppressed";
    errorDetail = nonEmptyString(payload.data?.suppressed?.message);
  }

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
