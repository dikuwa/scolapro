import "server-only";

export type CorrespondenceAiMode =
  | "draft"
  | "improve"
  | "formalize"
  | "simplify"
  | "proofread"
  | "shorten";

export class CorrespondenceAiUnavailableError extends Error {}

function config() {
  const baseUrl = process.env.SCOLAPRO_AI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.SCOLAPRO_AI_API_KEY;
  const model = process.env.SCOLAPRO_AI_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new CorrespondenceAiUnavailableError("AI assistance is not configured for this deployment.");
  }
  return { baseUrl, apiKey, model };
}

function modeInstruction(mode: CorrespondenceAiMode) {
  switch (mode) {
    case "draft":
      return "Draft the correspondence body from the user's instruction and supplied document context.";
    case "improve":
      return "Improve clarity, flow, tone and professionalism without changing the intended meaning.";
    case "formalize":
      return "Rewrite the text in a concise, professional official-school correspondence style.";
    case "simplify":
      return "Rewrite in plain, clear English that is easy to understand while remaining professional.";
    case "proofread":
      return "Correct grammar, spelling, punctuation and awkward wording while changing as little meaning as possible.";
    case "shorten":
      return "Shorten the text substantially while preserving all important facts and requests.";
  }
}

export async function generateCorrespondenceAiText(input: {
  mode: CorrespondenceAiMode;
  instruction?: string;
  existingText?: string;
  subject?: string;
  recipient?: string;
  attention?: string;
}) {
  const { baseUrl, apiKey, model } = config();
  const system = [
    "You assist authorized school leadership with official correspondence.",
    "Return only the proposed correspondence text. Do not use markdown headings, commentary, explanations or code fences.",
    "Do not invent policy requirements, legal authority, reference numbers, dates, names, approvals, quotations, factual claims or commitments.",
    "Preserve supplied names, dates, roles, facts and requests unless the user explicitly asks to change them.",
    "Do not add confidential learner, guardian, health, disciplinary or financial information that was not supplied.",
    "Use professional Namibian school-administration English and keep the writing practical and concise.",
    "The result remains a draft for human review; never imply that it is approved, signed, sent or finalized.",
  ].join(" ");

  const user = [
    modeInstruction(input.mode),
    input.instruction ? `User instruction: ${input.instruction}` : "",
    input.subject ? `Subject: ${input.subject}` : "",
    input.recipient ? `Recipient: ${input.recipient}` : "",
    input.attention ? `Attention: ${input.attention}` : "",
    input.existingText ? `Existing text:\n${input.existingText}` : "",
  ].filter(Boolean).join("\n\n");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: input.mode === "proofread" || input.mode === "shorten" ? 0.2 : 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1800,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("AI assistance service returned an error.");
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI assistance service returned no usable text.");
  return text;
}
