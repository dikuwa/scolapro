import "server-only";

export type CommunicationChannel = "app" | "email" | "sms" | "whatsapp" | "letter" | "other";

export type CommunicationTemplateTransportContext = {
  versionId: string;
  language: string;
  variables: unknown;
  parameters: Record<string, unknown>;
  providerTemplateKey: string;
  providerLanguage: string | null;
  providerConfig: Record<string, unknown>;
};

export type CommunicationTransportInput = {
  jobId: string;
  attemptCount: number;
  providerKey: string | null;
  channel: CommunicationChannel;
  destination: string | null;
  subject: string | null;
  body: string;
  template: CommunicationTemplateTransportContext | null;
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

function birdErrorDetail(
  responseBody: { message?: unknown; error?: { message?: unknown } | unknown } | null,
  status: number,
): string {
  const nestedMessage =
    responseBody?.error && typeof responseBody.error === "object" && "message" in responseBody.error
      ? (responseBody.error as { message?: unknown }).message
      : null;
  if (typeof responseBody?.message === "string") return responseBody.message;
  if (typeof nestedMessage === "string") return nestedMessage;
  return `HTTP ${status}`;
}

function declaredTemplateVariableKeys(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Communication template variables are invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || !("key" in item) || typeof item.key !== "string" || !item.key.trim()) {
      throw new Error("Communication template contains an invalid variable declaration.");
    }
    return item.key.trim();
  });
}

function birdTextParameter(value: unknown, key: string): { type: "text"; text: string } {
  if (typeof value === "string") return { type: "text", text: value };
  if (typeof value === "number" && Number.isFinite(value)) return { type: "text", text: String(value) };
  if (typeof value === "boolean") return { type: "text", text: value ? "true" : "false" };
  throw new Error(`Bird WhatsApp template parameter ${key} must be text, number, or boolean.`);
}

type BirdWhatsAppComponent = {
  type: "header" | "body" | "button";
  parameters: Array<{ type: "text"; text: string }>;
};

function birdWhatsAppComponents(template: CommunicationTemplateTransportContext): BirdWhatsAppComponent[] | undefined {
  const declaredKeys = declaredTemplateVariableKeys(template.variables);
  if (declaredKeys.length === 0) return undefined;

  const configured = template.providerConfig.components;
  if (configured === undefined) {
    return [
      {
        type: "body",
        parameters: declaredKeys.map((key) => birdTextParameter(template.parameters[key], key)),
      },
    ];
  }
  if (!Array.isArray(configured) || configured.length === 0) {
    throw new Error("Bird WhatsApp provider template components must be a non-empty array when configured.");
  }

  const usedKeys = new Set<string>();
  const components = configured.map((component): BirdWhatsAppComponent => {
    if (!component || typeof component !== "object") throw new Error("Bird WhatsApp component config is invalid.");
    const type = "type" in component ? component.type : null;
    if (type !== "header" && type !== "body" && type !== "button") {
      throw new Error("Bird WhatsApp component type must be header, body, or button.");
    }
    const parameterKeys = "parameter_keys" in component ? component.parameter_keys : null;
    if (!Array.isArray(parameterKeys) || parameterKeys.length === 0) {
      throw new Error(`Bird WhatsApp ${type} component requires parameter_keys.`);
    }

    const parameters = parameterKeys.map((candidate) => {
      if (typeof candidate !== "string" || !candidate.trim()) {
        throw new Error(`Bird WhatsApp ${type} component contains an invalid parameter key.`);
      }
      const key = candidate.trim();
      if (!declaredKeys.includes(key)) throw new Error(`Bird WhatsApp component references undeclared parameter ${key}.`);
      usedKeys.add(key);
      return birdTextParameter(template.parameters[key], key);
    });
    return { type, parameters };
  });

  for (const key of declaredKeys) {
    if (!usedKeys.has(key)) throw new Error(`Bird WhatsApp provider component mapping omits declared parameter ${key}.`);
  }
  return components;
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
    if (!response.ok) throw new Error(`Bird rejected SMS submission: ${birdErrorDetail(responseBody, response.status)}`);

    const providerMessageId = typeof responseBody?.id === "string" ? responseBody.id : null;
    if (!providerMessageId) throw new Error("Bird accepted the SMS without returning a message id.");

    return { providerKey: "bird_sms", providerMessageId };
  },
};

const birdWhatsAppAdapter: CommunicationTransportAdapter = {
  providerKey: "bird_whatsapp",
  async send(input) {
    if (input.channel !== "whatsapp") {
      throw new Error(`Provider bird_whatsapp cannot send ${input.channel} communications.`);
    }
    if (!input.template) throw new Error("Bird WhatsApp requires a governed approved template binding.");

    const apiKey = requiredEnv("BIRD_API_KEY");
    const baseUrl = birdApiBaseUrl();
    const destination = destinationRequired(input);
    const templateName = input.template.providerTemplateKey.trim();
    if (!templateName) throw new Error("Bird WhatsApp provider template name is required.");
    if (!/^[a-z0-9_]+$/.test(templateName)) {
      throw new Error("Bird WhatsApp provider template name must contain lowercase letters, digits, and underscores only.");
    }

    const language = input.template.providerLanguage?.trim() || input.template.language.trim() || undefined;
    const components = birdWhatsAppComponents(input.template);
    const templatePayload: { name: string; language?: string; components?: BirdWhatsAppComponent[] } = { name: templateName };
    if (language) templatePayload.language = language;
    if (components) templatePayload.components = components;

    const response = await fetch(`${baseUrl}/v1/whatsapp/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `scolapro/communication/${input.jobId}`,
      },
      body: JSON.stringify({ to: destination, template: templatePayload }),
      signal: AbortSignal.timeout(20_000),
    });

    const responseBody = (await response.json().catch(() => null)) as {
      id?: unknown;
      message?: unknown;
      error?: { message?: unknown } | unknown;
    } | null;
    if (!response.ok) {
      throw new Error(`Bird rejected WhatsApp submission: ${birdErrorDetail(responseBody, response.status)}`);
    }

    const providerMessageId = typeof responseBody?.id === "string" ? responseBody.id : null;
    if (!providerMessageId) throw new Error("Bird accepted the WhatsApp message without returning a message id.");
    return { providerKey: "bird_whatsapp", providerMessageId };
  },
};

const inAppAdapter: CommunicationTransportAdapter = {
  providerKey: "in_app",
  async send(input) {
    if (input.channel !== "app") throw new Error(`Provider in_app cannot send ${input.channel} communications.`);
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
  if (normalized === birdWhatsAppAdapter.providerKey) return birdWhatsAppAdapter;
  if (normalized === mockAdapter.providerKey) return mockAdapter;

  throw new Error(`No communication transport adapter is registered for provider ${normalized}.`);
}
