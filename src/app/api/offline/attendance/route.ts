import { NextResponse } from "next/server";
import { z } from "zod";
import { submitDailyRegister } from "@/features/attendance/server/actions";
import { getUserContext } from "@/lib/auth/get-user-context";

const payloadSchema = z.object({
  scope: z.object({
    userId: z.string().uuid(),
    tenantId: z.string().uuid(),
    schoolId: z.string().uuid(),
  }),
  payload: z.object({
    registerClassId: z.string().uuid(),
    viewRegisterClassId: z.string().uuid().optional(),
    attendanceDate: z.string().date(),
    viewAttendanceDate: z.string().date().optional(),
    clientMutationId: z.string().uuid(),
    replacesSubmissionId: z.string().uuid().nullable(),
    exceptions: z.array(z.object({
      enrolment_id: z.string().uuid(),
      status: z.enum(["absent", "late", "excused", "unknown"]),
      reason_id: z.string().uuid().nullable().optional(),
      note: z.string().max(500).nullable().optional(),
    })),
  }),
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Offline attendance payload is invalid." }, { status: 400 });

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch {
    // Offline sync must fail closed when the account's security clearance or
    // school authority cannot be resolved. Never apply queued mutations.
    return NextResponse.json({ message: "Account security or school access must be verified before syncing." }, { status: 403 });
  }
  const membership = context.currentSchoolMembership;
  if (
    !context.user
    || context.user.id !== parsed.data.scope.userId
    || !membership
    || membership.tenantId !== parsed.data.scope.tenantId
    || membership.schoolId !== parsed.data.scope.schoolId
  ) {
    return NextResponse.json({ message: "Your current school access changed before this offline register could sync." }, { status: 409 });
  }

  const formData = new FormData();
  formData.set("registerClassId", parsed.data.payload.registerClassId);
  formData.set("viewRegisterClassId", parsed.data.payload.viewRegisterClassId ?? parsed.data.payload.registerClassId);
  formData.set("attendanceDate", parsed.data.payload.attendanceDate);
  formData.set("viewAttendanceDate", parsed.data.payload.viewAttendanceDate ?? parsed.data.payload.attendanceDate);
  formData.set("clientMutationId", parsed.data.payload.clientMutationId);
  formData.set("replacesSubmissionId", parsed.data.payload.replacesSubmissionId ?? "");
  formData.set("exceptions", JSON.stringify(parsed.data.payload.exceptions));
  formData.set("source", "offline_sync");

  const result = await submitDailyRegister({}, formData);
  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}
