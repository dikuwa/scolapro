import "server-only";

export type LessonDraftSection =
  | "resources" | "introduction" | "lessonStructure" | "teacherActivities"
  | "learnerActivities" | "consolidation" | "assessment" | "homeworkMonitoring"
  | "differentiation" | "englishAcrossCurriculum" | "compensatoryTeaching"
  | "reflectionAmendments";

export type LessonDraftMode = "draft" | "regenerate" | "shorten" | "practical";

export type LessonAiRequest = {
  section: LessonDraftSection;
  mode: LessonDraftMode;
  subject: string;
  grade: string;
  theme: string | null;
  topic: string | null;
  generalObjectives: string[];
  selectedCompetencies: string[];
  sessionCount: number;
  existingText?: string;
};

export class LessonAiUnavailableError extends Error {}

function config() {
  const baseUrl = process.env.SCOLAPRO_AI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.SCOLAPRO_AI_API_KEY;
  const model = process.env.SCOLAPRO_AI_MODEL;
  if (!baseUrl || !apiKey || !model) throw new LessonAiUnavailableError("AI drafting is not configured for this deployment.");
  return { baseUrl, apiKey, model };
}

function instruction(mode: LessonDraftMode, section: LessonDraftSection) {
  if (mode === "shorten") return `Shorten the existing ${section} text while preserving its instructional meaning and all binding competency coverage.`;
  if (mode === "practical") return `Rewrite the ${section} section to be more practical, classroom-ready, low-cost and realistic for a Namibian secondary-school context.`;
  if (mode === "regenerate") return `Regenerate only the ${section} section with a materially different but equally valid approach.`;
  return `Draft only the ${section} section.`;
}

export async function generateLessonDraftSection(input: LessonAiRequest) {
  if (!input.selectedCompetencies.length) throw new Error("At least one binding competency is required.");
  const { baseUrl, apiKey, model } = config();
  const system = [
    "You assist a teacher drafting one lesson-preparation section.",
    "The selected specific objectives/basic competencies are binding targets.",
    "General objectives are context only and must not override or invent curriculum requirements.",
    "Do not invent official syllabus text, learner names, marks, health/support information or policy requirements.",
    "Return plain text for the requested section only. No markdown heading.",
  ].join(" ");
  const user = [
    instruction(input.mode, input.section),
    `Subject: ${input.subject}`,
    `Grade: ${input.grade}`,
    `Theme: ${input.theme ?? "Not supplied"}`,
    `Topic: ${input.topic ?? "Not supplied"}`,
    `Sessions: ${input.sessionCount}`,
    `General objective context: ${input.generalObjectives.join(" | ") || "Not supplied"}`,
    `Binding competencies: ${input.selectedCompetencies.join(" | ")}`,
    input.existingText ? `Existing section text: ${input.existingText}` : "",
  ].filter(Boolean).join("\n");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: input.mode === "shorten" ? 0.2 : 0.5,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AI drafting service returned an error.");
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI drafting service returned no usable text.");
  return text;
}
