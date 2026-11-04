import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CorrespondenceAiUnavailableError,
  generateCorrespondenceAiText,
} from "@/features/correspondence/server/correspondence-ai";
import { getUserContext } from "@/lib/auth/get-user-context";

const roles = new Set(["school_admin", "principal", "deputy_principal"]);
const schema = z.object({
  mode: z.enum(["draft", "improve", "formalize", "simplify", "proofread", "shorten"]),
  instruction: z.string().trim().max(3000).optional(),
  existingText: z.string().max(12000).optional(),
  subject: z.string().trim().max(500).optional(),
  recipient: z.string().trim().max(500).optional(),
  attention: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === "draft" && !value.instruction) {
    ctx.addIssue({ code: "custom", message: "Drafting requires an instruction.", path: ["instruction"] });
  }
  if (value.mode !== "draft" && !value.existingText?.trim()) {
    ctx.addIssue({ code: "custom", message: "Editing requires correspondence text.", path: ["existingText"] });
  }
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "AI request is invalid." }, { status: 400 });
  }

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch {
    return NextResponse.json({ message: "Complete account security setup before using AI drafting." }, { status: 403 });
  }
  if (!context.user || context.platformMemberships.length) {
    return NextResponse.json({ message: "School leadership access is required." }, { status: 403 });
  }
  const membership = context.memberships.find((item) => roles.has(item.roleKey));
  if (!membership) {
    return NextResponse.json({ message: "School leadership access is required." }, { status: 403 });
  }

  try {
    const text = await generateCorrespondenceAiText(parsed.data);
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof CorrespondenceAiUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    return NextResponse.json({ message: "AI assistance could not complete this request." }, { status: 502 });
  }
}
