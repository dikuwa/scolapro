import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTeachingActual } from "@/features/teaching/server/coverage-actions";
import { getUserContext } from "@/lib/auth/get-user-context";

const payloadSchema = z.object({
  scope: z.object({ userId: z.string().uuid(), tenantId: z.string().uuid(), schoolId: z.string().uuid() }),
  payload: z.object({
    clientMutationId: z.string().uuid(), scheduleItemId: z.string().uuid(), taughtOn: z.string().date(), periodsUsed: z.number().int().min(1).max(20),
    coverageState: z.enum(["not_started", "started", "partially_taught", "taught", "reinforcement_needed", "assessed"]),
    reflection: z.string().max(3000), compensatoryAction: z.string().max(2000),
  }),
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Offline teaching coverage payload is invalid." }, { status: 400 });
  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (!context.user || context.user.id !== parsed.data.scope.userId || !membership || membership.tenantId !== parsed.data.scope.tenantId || membership.schoolId !== parsed.data.scope.schoolId) {
    return NextResponse.json({ success: false, message: "Your current school access changed before this teaching actual could sync." }, { status: 409 });
  }
  const formData = new FormData();
  formData.set("clientMutationId", parsed.data.payload.clientMutationId);
  formData.set("scheduleItemId", parsed.data.payload.scheduleItemId);
  formData.set("taughtOn", parsed.data.payload.taughtOn);
  formData.set("periodsUsed", String(parsed.data.payload.periodsUsed));
  formData.set("coverageState", parsed.data.payload.coverageState);
  formData.set("reflection", parsed.data.payload.reflection);
  formData.set("compensatoryAction", parsed.data.payload.compensatoryAction);
  formData.set("source", "offline_sync");
  const result = await recordTeachingActual({ success: false, message: "" }, formData);
  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}
