import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  scope: z.object({
    userId: z.string().uuid(),
    tenantId: z.string().uuid(),
    schoolId: z.string().uuid(),
  }),
  payload: z.object({
    assessmentInstanceId: z.string().uuid(),
    enrolmentId: z.string().uuid(),
    learnerId: z.string().uuid(),
    numericMark: z.number().nullable(),
    markStatus: z.enum(["absent", "exempt", "incomplete", "withheld"]).nullable(),
    teacherNote: z.string().max(2000).nullable(),
    expectedVersion: z.string().uuid().nullable(),
    clientMutationId: z.string().uuid(),
  }),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Offline marks draft payload is invalid." }, { status: 400 });

  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (
    !context.user
    || context.user.id !== parsed.data.scope.userId
    || !membership
    || membership.tenantId !== parsed.data.scope.tenantId
    || membership.schoolId !== parsed.data.scope.schoolId
  ) {
    return NextResponse.json(
      { message: "Your current school access changed before this marks draft could sync." },
      { status: 409 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const payload = parsed.data.payload;
  const { data, error } = await supabase.rpc("submit_offline_assessment_mark", {
    p_assessment_instance_id: payload.assessmentInstanceId,
    p_enrolment_id: payload.enrolmentId,
    p_learner_id: payload.learnerId,
    p_numeric_mark: payload.numericMark,
    p_mark_status: payload.markStatus,
    p_teacher_note: payload.teacherNote,
    p_expected_version: payload.expectedVersion,
    p_client_mutation_id: payload.clientMutationId,
  });

  if (error) return NextResponse.json({ message: error.message }, { status: 409 });
  const result = data as { outcome?: string; code?: string };
  if (result.outcome === "conflicted") return NextResponse.json(result, { status: 409 });
  if (result.outcome === "rejected") return NextResponse.json(result, { status: 422 });
  return NextResponse.json(result);
}