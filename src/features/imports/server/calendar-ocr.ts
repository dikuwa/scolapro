import "server-only";

export class CalendarOcrUnavailableError extends Error {}

type ExtractedCalendarEvent = {
  title: string;
  category: string;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
  teachingImpact: "NORMAL" | "NO_TEACHING" | "PARTIAL_DAY" | "ALTERED_TIMETABLE" | "EXAM_TIMETABLE";
};

function config() {
  const baseUrl = process.env.SCOLAPRO_AI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.SCOLAPRO_AI_API_KEY;
  const model = process.env.SCOLAPRO_AI_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new CalendarOcrUnavailableError("OCR extraction is not configured for this deployment.");
  }
  return { baseUrl, apiKey, model };
}

function cleanJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

function validIsoDate(value: unknown, year: number) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (!value.startsWith(`\${year}-`)) return false;
  const parsed = new Date(`\${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export async function extractCalendarEventsFromImage(input: {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  academicYear: number;
}) {
  const { baseUrl, apiKey, model } = config();
  const imageUrl = `data:\${input.mimeType};base64,\${Buffer.from(input.bytes).toString("base64")}`;

  const system = [
    "You extract calendar/activity rows from a photographed or scanned school document.",
    "Return JSON only with shape {\\\"events\\\":[...]} and no markdown.",
    "Use only information visibly present in the source. Never invent dates, times, audiences, closures, policy or event text.",
    `Normalize dates to ISO YYYY-MM-DD using academic year \${input.academicYear}. If a date/range cannot be resolved confidently, omit that row rather than guessing.`,
    "Preserve the source title meaning while removing table formatting noise.",
    "Allowed category values: Information, Meeting, Assessment, Examination, School activity, Deadline, Teaching cutoff, Ceremony, Sport, School holiday, Public holiday, Other.",
    "Allowed teachingImpact values: NORMAL, NO_TEACHING, PARTIAL_DAY, ALTERED_TIMETABLE, EXAM_TIMETABLE.",
    "Default teachingImpact to NORMAL. Use NO_TEACHING only when the visible source explicitly says school holiday, no school, closure, or equivalent.",
    "A commemoration, meeting, competition, exhibition, examination, ceremony or activity is NORMAL unless the source explicitly says learners do not attend.",
    "Do not infer start/end times. Use null unless visible.",
  ].join(" ");

  const response = await fetch(`\${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer \${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 5000,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract each visible calendar/activity row. For ranges, use startsOn and endsOn. Put useful visible contextual text that is not part of the concise title in description.",
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("OCR extraction service returned an error.");
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OCR extraction service returned no usable rows.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson(raw));
  } catch {
    throw new Error("OCR extraction service returned invalid structured data.");
  }

  const rows = (parsed as { events?: unknown[] })?.events;
  if (!Array.isArray(rows)) throw new Error("OCR extraction service returned no calendar event list.");

  const allowedImpact = new Set(["NORMAL", "NO_TEACHING", "PARTIAL_DAY", "ALTERED_TIMETABLE", "EXAM_TIMETABLE"]);
  const events: ExtractedCalendarEvent[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const category = typeof row.category === "string" ? row.category.trim() : "Information";
    const startsOn = row.startsOn;
    const endsOn = row.endsOn ?? row.startsOn;
    if (!title || title.length > 180 || !validIsoDate(startsOn, input.academicYear) || !validIsoDate(endsOn, input.academicYear)) continue;
    if (String(endsOn) < String(startsOn)) continue;

    const impactRaw = typeof row.teachingImpact === "string" ? row.teachingImpact.toUpperCase() : "NORMAL";
    const teachingImpact = (allowedImpact.has(impactRaw) ? impactRaw : "NORMAL") as ExtractedCalendarEvent["teachingImpact"];
    const startsAt = typeof row.startsAt === "string" && /^\d{2}:\d{2}$/.test(row.startsAt) ? row.startsAt : null;
    const endsAt = typeof row.endsAt === "string" && /^\d{2}:\d{2}$/.test(row.endsAt) ? row.endsAt : null;

    events.push({
      title,
      category: category.slice(0, 80) || "Information",
      startsOn: String(startsOn),
      endsOn: String(endsOn),
      startsAt: startsAt && endsAt ? startsAt : null,
      endsAt: startsAt && endsAt ? endsAt : null,
      description: typeof row.description === "string" ? row.description.trim().slice(0, 2000) || null : null,
      teachingImpact,
    });
  }

  if (!events.length) throw new Error("No reviewable calendar rows could be extracted from this image.");
  return events;
}
