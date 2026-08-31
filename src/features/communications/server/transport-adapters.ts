import "server-only";

export type CommunicationChannel = "app" | "email" | "sms" | "whatsapp" | "letter" | "other";

export type CommunicationTransportInput = {
  jobId: string;
  attemptCount: number;
  providerKey: string | null;
  channel: CommunicationChannel;
  destination: string | null;
  subject: string | null;
  body: string;
};

export type CommunicationTransportAccepted = {
  providerKey: string;
  providerMessageId: string | null;
};

export interface CommunicationTransportAdapter {
  readonly providerKey: string;
  send(input: CommunicationTransportInput): Promise<CommunicationTransportAccepted>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function destinationRequired(input: CommunicationTransportInput): string {
  const destination = input.destination?.trim();
  if (!destination) throw new Error(`Communication destination is required for ${input.channel}.`);
  return destination;
}

function birdApiBaseUrl(): string {
  const configured = requiredEnv("BIRD_API_BASE_URL");
  const url = new URL(configured);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".platform.bird.com")) {
    throw new Error("BIRD_API_BASE_URL must be an HTTPS Bird regional platform host.");
  }
  return url.toString().replace(/\/$/, "");
}

function birdSmsCategory(): "transactional" | "marketing" | "authentication" | "service" {
  const value = process.env.BIRD_SMS_CATEGORY?.trim() || "transactional";
  if (value === "transactional" || value === "marketing" || value === "authentication" || value === "service") {
    return value;
  }
  throw new Error("BIRD_SMS_CATEGORY must be transactional, marketing, authentication, or service.");
}

const resendEmailAdapter: CommunicationTransportAdapter = {
  providerKey: "resend_email",
  async send(input) {
    if (input.channel !== "email") {
      throw new Error(`Provider resend_email cannot send ${input.channel} communications.`);
    }

    const apiKey = requiredEnv("RESEND_API_KEY");
    const from = requiredEnv("RESEND_FROM_EMAIL");
    const destination = destinationRequired(input);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `scolapro/communication/${input.jobId}`,
      },
      body: JSON.stringify({
        from,
        to: [destination],
        subject: input.subject?.trim() || "ScolaPro notification",
        text: input.body,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const responseBody = (await response.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
    if (!response.ok) {
      const detail = typeof responseBody?.message === "string" ? responseBody.message : `HTTP ${response.status}`;
      throw new Error(`Resend rejected email submission: ${detail}`);
    }

    const providerMessageId = typeof responseBody?.id === "string" ? responseBody.id : null;
    if (!providerMessageId) throw new Error("Resend accepted the request without returning a message id.");

    return { providerKey: "resend_email", providerMessageId };
  },
};

const birdSmsAdapter: CommunicationTransportAdapter = {
  providerKey: "bird_sms",
  async send(input) {
    if (input.channel !== "sms") throw new Error(`Provider bird_sms cannot send ${input.channel} communications.`);

    const apiKey = requiredEnv("BIRD_API_KEY");
    const baseUrl = birdApiBaseUrl();
    const from = requiredEnv("BIRD_SMS_FROM");
    const destination = destinationRequired(input);

    const response = await fetch(`${baseUrl}/v1/sms/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `scolapro/communication/${input.jobId}`,
      },
      body: JSON.stringify({
        to: destination,
        from,
        text: input.body,
        category: birdSmsCategory(),
        metadata: { scolapro_job_id: input.jobId },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const responseBody = (await response.json().catch(() => null)) as {
      id?: unknown;
      message?: unknown;
      error?: { message?: unknown } | unknown;
    } | null;
    if (!response.ok) {
      const nestedMessage =
        responseBody?.error && typeof responseBody.error === "object" && "message" in responseBody.error
          ? (responseBody.error as { message?: unknown }).message
          : null;
      const detail =
        typeof responseBody?.message === "string"
          ? responseBody.message
          : typeof nestedMessage === "string"
            ? nestedMessage
            : `HTTP ${response.status}`;
      throw new Error(`Bird rejected SMS submission: ${detail}`);
    }

    const providerMessageId = typeof responseBody?.id === "string" ? responseBody.id : null;
    if (!providerMessageId) throw new Error("Bird accepted the SMS without returning a message id.");

    return { providerKey: "bird_sms", providerMessageId };
  },
};

const inAppAdapter: CommunicationTransportAdapter = {
  providerKey: "in_app",
  async send(input) {
    if (input.channel !== "app") throw new Error(`Provider in_app cannot send ${input.channel} communications.`);
    // The canonical communication + recipient rows are already persisted before the
    // outbox is processed. Completing the transport job records that server-side
    // publication step without falsely claiming that a human opened/read the message.
    return { providerKey: "in_app", providerMessageId: `in-app:${input.jobId}` };
  },
};

const mockAdapter: CommunicationTransportAdapter = {
  providerKey: "mock",
  async send(input) {
    if (process.env.COMMUNICATION_MOCK_TRANSPORT_ENABLED !== "true") {
      throw new Error("Mock communication transport is disabled.");
    }
    return { providerKey: "mock", providerMessageId: `mock:${input.jobId}:${input.attemptCount}` };
  },
};

export function resolveCommunicationTransportAdapter(
  channel: CommunicationChannel,
  providerKey: string | null,
): CommunicationTransportAdapter {
  if (channel === "app") return inAppAdapter;

  const normalized = providerKey?.trim() || null;
  if (!normalized) throw new Error(`No active provider route is configured for ${channel}.`);
  if (normalized === resendEmailAdapter.providerKey) return resendEmailAdapter;
  if (normalized === birdSmsAdapter.providerKey) return birdSmsAdapter;
  if (normalized === mockAdapter.providerKey) return mockAdapter;

  throw new Error(`No communication transport adapter is registered for provider ${normalized}.`);
}
