import { NextResponse } from "next/server";
import { z } from "zod";
import { submitSubjectAttendance } from "@/features/attendance/server/subject-actions";
import { getUserContext } from "@/lib/auth/get-user-context";

const payloadSchema = z.object({
  scope: z.object({ userId: z.string().uuid(), tenantId: z.string().uuid(), schoolId: z.string().uuid() }),
  payload: z.object({
    slotId: z.string().uuid(), attendanceDate: z.string().date(), clientMutationId: z.string().uuid(), replacesSubmissionId: z.string().uuid().nullable(),
    exceptions: z.array(z.object({ enrolment_id: z.string().uuid(), status: z.enum(["absent", "late", "excused", "unknown"]), reason_id: z.string().uuid().nullable(), note: z.string().max(500).nullable() })),
  }),
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Offline lesson attendance payload is invalid." }, { status: 400 });
  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (!context.user || context.user.id !== parsed.data.scope.userId || !membership || membership.tenantId !== parsed.data.scope.tenantId || membership.schoolId !== parsed.data.scope.schoolId) {
    return NextResponse.json({ message: "Your current school access changed before this offline lesson could sync." }, { status: 409 });
  }
  const formData = new FormData();
  formData.set("slotId", parsed.data.payload.slotId);
  formData.set("attendanceDate", parsed.data.payload.attendanceDate);
  formData.set("clientMutationId", parsed.data.payload.clientMutationId);
  formData.set("replacesSubmissionId", parsed.data.payload.replacesSubmissionId ?? "");
  formData.set("exceptions", JSON.stringify(parsed.data.payload.exceptions));
  formData.set("source", "offline_sync");
  const result = await submitSubjectAttendance({}, formData);
  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}
