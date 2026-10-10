import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateLessonDraftSection, LessonAiUnavailableError } from "@/features/academics/server/lesson-preparation-ai";

const section = z.enum([
  "resources","introduction","lessonStructure","teacherActivities","learnerActivities",
  "consolidation","assessment","homeworkMonitoring","differentiation",
  "englishAcrossCurriculum","compensatoryTeaching","reflectionAmendments",
]);
const mode = z.enum(["draft","regenerate","shorten","practical"]);
const schema = z.object({
  scheduleId: z.string().uuid(),
  section,
  mode,
  selectedCompetencyIds: z.array(z.string().uuid()).min(1),
  sessionCount: z.number().int().min(1).max(30),
  existingText: z.string().max(12000).optional(),
});

const teacherRoles = new Set(["teacher","class_teacher"]);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "AI lesson-drafting request is invalid." }, { status: 400 });

  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch {
    return NextResponse.json({ message: "Complete account security setup before using AI drafting." }, { status: 403 });
  }
  if (!context.user || context.platformMemberships.length) return NextResponse.json({ message: "Teacher access is required." }, { status: 403 });
  const membership = context.memberships.find((item) => teacherRoles.has(item.roleKey));
  if (!membership) return NextResponse.json({ message: "Teacher access is required." }, { status: 403 });

  const db = await createSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { data: aiFeature } = await db.from("tenant_features")
    .select("enabled,configuration,effective_from,effective_to")
    .eq("tenant_id", membership.tenantId)
    .eq("feature_key", "ai_lesson_preparation")
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aiFeature?.enabled !== true) {
    return NextResponse.json({ message: "AI lesson drafting is not enabled for this tenant." }, { status: 403 });
  }
  const featureConfig = aiFeature.configuration && typeof aiFeature.configuration === "object" && !Array.isArray(aiFeature.configuration)
    ? aiFeature.configuration as Record<string, unknown>
    : {};
  const allowTeacherTextToProvider = featureConfig.allow_teacher_text_to_provider === true;
  if (parsed.data.existingText && ["shorten", "practical"].includes(parsed.data.mode) && !allowTeacherTextToProvider) {
    return NextResponse.json({ message: "This tenant has not enabled sending teacher-authored text to the AI provider." }, { status: 403 });
  }
  const { data: staff } = await db.from("staff_members").select("id").eq("user_id", context.user.id).maybeSingle();
  if (!staff) return NextResponse.json({ message: "Teacher identity is not connected." }, { status: 403 });

  const { data: schedule } = await db.from("teaching_schedule_items")
    .select("id,school_id,teacher_allocation_id,pacing_plan_item_id")
    .eq("id", parsed.data.scheduleId).maybeSingle();
  if (!schedule || schedule.school_id !== membership.schoolId) return NextResponse.json({ message: "Lesson is outside the current school." }, { status: 403 });

  const { data: allocation } = await db.from("teacher_allocations")
    .select("id,staff_member_id,subject_offering_id")
    .eq("id", schedule.teacher_allocation_id).eq("staff_member_id", staff.id).maybeSingle();
  if (!allocation) return NextResponse.json({ message: "Lesson is outside your current teaching allocation." }, { status: 403 });

  const { data: pacing } = await db.from("pacing_plan_items").select("curriculum_unit_id").eq("id", schedule.pacing_plan_item_id).maybeSingle();
  if (!pacing?.curriculum_unit_id) return NextResponse.json({ message: "This lesson is not linked to a curriculum unit." }, { status: 409 });

  const [{ data: unit }, { data: competencies }, { data: objectives }, { data: offering }] = await Promise.all([
    db.from("curriculum_units").select("id,theme,topic").eq("id", pacing.curriculum_unit_id).maybeSingle(),
    db.from("curriculum_competencies").select("id,competency_text").eq("curriculum_unit_id", pacing.curriculum_unit_id),
    db.from("curriculum_objectives").select("objective_text").eq("curriculum_unit_id", pacing.curriculum_unit_id).order("sequence_number"),
    db.from("subject_offerings").select("subject_id,grade_id").eq("id", allocation.subject_offering_id).maybeSingle(),
  ]);
  if (!unit || !offering) return NextResponse.json({ message: "Curriculum context is incomplete." }, { status: 409 });

  const allowed = new Map((competencies ?? []).map((row) => [row.id, row.competency_text]));
  const selected = parsed.data.selectedCompetencyIds.map((id) => allowed.get(id)).filter((value): value is string => Boolean(value));
  if (selected.length !== parsed.data.selectedCompetencyIds.length) return NextResponse.json({ message: "Selected competency is outside this curriculum unit." }, { status: 409 });

  const [{ data: subject }, { data: grade }] = await Promise.all([
    db.from("subjects").select("display_name").eq("id", offering.subject_id).maybeSingle(),
    db.from("grades").select("display_name").eq("id", offering.grade_id).maybeSingle(),
  ]);

  try {
    const text = await generateLessonDraftSection({
      section: parsed.data.section,
      mode: parsed.data.mode,
      subject: subject?.display_name ?? "Assigned subject",
      grade: grade?.display_name ?? "Assigned grade",
      theme: unit.theme ?? null,
      topic: unit.topic ?? null,
      generalObjectives: (objectives ?? []).map((row) => row.objective_text),
      selectedCompetencies: selected,
      sessionCount: parsed.data.sessionCount,
      existingText: allowTeacherTextToProvider ? parsed.data.existingText : undefined,
    });
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof LessonAiUnavailableError) return NextResponse.json({ message: error.message }, { status: 503 });
    return NextResponse.json({ message: "AI drafting could not complete this section." }, { status: 502 });
  }
}
