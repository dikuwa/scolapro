import "server-only";

export type LearnerTransferSummaryField = "behaviour" | "health" | "other";

export class LearnerTransferAiUnavailableError extends Error {}

function config() {
  const baseUrl = process.env.SCOLAPRO_AI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.SCOLAPRO_AI_API_KEY;
  const model = process.env.SCOLAPRO_AI_MODEL;
  if (!baseUrl || !apiKey || !model) throw new LearnerTransferAiUnavailableError("AI assistance is not configured for this deployment.");
  return { baseUrl, apiKey, model };
}

export async function generateLearnerTransferSummary(input: {
  field: LearnerTransferSummaryField;
  sourceText: string;
}) {
  const { baseUrl, apiKey, model } = config();
  const fieldInstruction = input.field === "behaviour"
    ? "Summarize the supplied governed conduct/development observations into a neutral, concise transfer-form behaviour statement."
    : input.field === "health"
      ? "Summarize only the supplied authorized health facts into a concise transfer-form state-of-health statement. Do not infer diagnoses, prognosis, disability, treatment, risk, or any fact not explicitly supplied."
      : "Summarize the supplied routine cumulative-record remarks into concise, relevant transfer-form information.";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content: [
            "You assist authorized Namibian school staff with a learner transfer form.",
            "Return only one concise proposed statement, without headings, bullets, markdown, or commentary.",
            "Use only the supplied source facts. Never invent, diagnose, infer, embellish, or add confidential facts.",
            "The result is a draft for human review and override; never imply it is verified or final.",
          ].join(" "),
        },
        { role: "user", content: `${fieldInstruction}\n\nGoverned source facts:\n${input.sourceText}` },
      ],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AI assistance service returned an error.");
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const summary = body.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error("AI assistance service returned no usable text.");
  return summary;
}
