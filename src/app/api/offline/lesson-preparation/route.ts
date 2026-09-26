import { NextResponse } from "next/server";
import { z } from "zod";
import { saveLessonPreparationOffline } from "@/features/academics/server/lesson-preparation";
import { getUserContext } from "@/lib/auth/get-user-context";

const schema = z.object({
  scope: z.object({ userId: z.string().uuid(), tenantId: z.string().uuid(), schoolId: z.string().uuid() }),
  payload: z.object({
    scheduleId: z.string().uuid(), clientMutationId: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime().nullable(), preparation: z.record(z.string(), z.string()),
    selectedCompetencyIds: z.array(z.string().uuid()).default([]),
    sessionCount: z.number().int().min(1).max(30).default(1),
  }),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Offline lesson-preparation payload is invalid." }, { status: 400 });
  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (!context.user || context.user.id !== parsed.data.scope.userId || !membership
    || membership.tenantId !== parsed.data.scope.tenantId || membership.schoolId !== parsed.data.scope.schoolId) {
    return NextResponse.json({ message: "Your current school access changed before this draft could sync." }, { status: 409 });
  }
  const form = new FormData();
  form.set("scheduleId", parsed.data.payload.scheduleId);
  form.set("clientMutationId", parsed.data.payload.clientMutationId);
  form.set("expectedUpdatedAt", parsed.data.payload.expectedUpdatedAt ?? "");
  form.set("selectedCompetencyIds", parsed.data.payload.selectedCompetencyIds.join(","));
  form.set("sessionCount", String(parsed.data.payload.sessionCount));
  for (const [key, value] of Object.entries(parsed.data.payload.preparation)) form.set(key, value);
  const result = await saveLessonPreparationOffline(form);
  return result.success ? NextResponse.json(result) : NextResponse.json(result, { status: 409 });
}