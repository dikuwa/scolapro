"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ineligibleDailyAttendanceDate } from "@/features/attendance/server/learner-calendar-bounds";
import { canCaptureSubjectPeriod } from "@/features/attendance/server/capture-scope";
import { resolveAttendanceTeachingImpact } from "@/features/attendance/server/register";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SubjectAttendanceState = { success?: boolean; message?: string };

const schema = z.object({
  slotId: z.string().uuid(),
  attendanceDate: z.string().date(),
  clientMutationId: z.string().uuid(),
  source: z.enum(["online", "offline_sync"]).default("online"),
  replacesSubmissionId: z.string().uuid().nullable(),
  exceptions: z.array(z.object({ enrolment_id: z.string().uuid(), status: z.enum(["absent","late","excused","unknown"]), reason_id: z.string().uuid().nullable(), note: z.string().max(500).nullable() })),
});

export async function submitSubjectAttendance(_state: SubjectAttendanceState, formData: FormData): Promise<SubjectAttendanceState> {
  let exceptions: unknown = [];
  try { exceptions = JSON.parse(String(formData.get("exceptions") ?? "[]")); } catch { return { message: "Attendance changes could not be read." }; }
  const rawReplacement = String(formData.get("replacesSubmissionId") ?? "").trim();
  const parsed = schema.safeParse({ slotId: formData.get("slotId"), attendanceDate: formData.get("attendanceDate"), clientMutationId: formData.get("clientMutationId"), source: formData.get("source") ?? "online", replacesSubmissionId: rawReplacement || null, exceptions });
  if (!parsed.success) return { message: "Check the lesson attendance details and try again." };
  const context = await getUserContext();
  if (!context.user) return { message: "You do not have permission to record lesson attendance." };
  const supabase = await createSupabaseServerClient();
  const { data: slot, error: slotError } = await supabase.from("timetable_slots")
    .select("id,school_id,academic_year,register_class_id,status,teacher_allocation_id,timetable_periods(is_teaching_period),teacher_allocations(staff_member_id,active_from,active_to,school_id,academic_year,register_class_id)")
    .eq("id", parsed.data.slotId)
    .maybeSingle();
  const allocation = Array.isArray(slot?.teacher_allocations) ? slot.teacher_allocations[0] : slot?.teacher_allocations;
  const period = Array.isArray(slot?.timetable_periods) ? slot.timetable_periods[0] : slot?.timetable_periods;
  if (slotError || !slot || !allocation || !period) return { message: "The assigned lesson could not be verified." };
  const structurallyValid = allocation.school_id === slot.school_id
    && allocation.academic_year === slot.academic_year
    && allocation.register_class_id === slot.register_class_id;
  if (!structurallyValid || !canCaptureSubjectPeriod({
    memberships: context.memberships,
    platformRoles: context.platformMemberships.map((item) => item.roleKey),
  }, {
    schoolId: slot.school_id,
    allocatedStaffMemberId: allocation.staff_member_id,
    allocationActiveFrom: allocation.active_from,
    allocationActiveTo: allocation.active_to,
    slotStatus: slot.status,
    isTeachingPeriod: period.is_teaching_period,
  }, parsed.data.attendanceDate)) {
    return { message: "This lesson is outside your current subject, group or period assignment." };
  }

  const blockedDate = await ineligibleDailyAttendanceDate(
    parsed.data.attendanceDate,
    (attendanceDate) => resolveAttendanceTeachingImpact(slot.school_id, attendanceDate),
  );
  if (blockedDate) return { message: "This date is not an eligible teaching day for lesson attendance." };

  if (parsed.data.exceptions.length) {
    const exceptionIds = [...new Set(parsed.data.exceptions.map((item) => item.enrolment_id))];
    const { data: scopedEnrolments, error: enrolmentError } = await supabase.from("enrolments")
      .select("id")
      .eq("school_id", slot.school_id)
      .eq("academic_year", slot.academic_year)
      .eq("register_class_id", slot.register_class_id)
      .lte("enrolled_from", parsed.data.attendanceDate)
      .or(`enrolled_to.is.null,enrolled_to.gte.${parsed.data.attendanceDate}`)
      .in("id", exceptionIds);
    if (enrolmentError || new Set((scopedEnrolments ?? []).map((item) => item.id)).size !== exceptionIds.length) {
      return { message: "One or more lesson attendance entries are outside this assigned class." };
    }

    const { data: groupAllocations, error: groupAllocationError } = await supabase.from("teaching_group_allocations")
      .select("teaching_group_id")
      .eq("teacher_allocation_id", slot.teacher_allocation_id)
      .lte("effective_from", parsed.data.attendanceDate)
      .or(`effective_to.is.null,effective_to.gte.${parsed.data.attendanceDate}`);
    if (groupAllocationError) return { message: "The assigned teaching group could not be verified." };
    const groupIds = [...new Set((groupAllocations ?? []).map((item) => item.teaching_group_id))];
    if (groupIds.length) {
      const { data: groupMembers, error: groupMemberError } = await supabase.from("teaching_group_memberships")
        .select("enrolment_id")
        .in("teaching_group_id", groupIds)
        .in("enrolment_id", exceptionIds)
        .lte("effective_from", parsed.data.attendanceDate)
        .or(`effective_to.is.null,effective_to.gte.${parsed.data.attendanceDate}`);
      if (groupMemberError || new Set((groupMembers ?? []).map((item) => item.enrolment_id)).size !== exceptionIds.length) {
        return { message: "One or more lesson attendance entries are outside the assigned teaching group." };
      }
    }
  }
  const { error } = await supabase.rpc("submit_subject_period_attendance", {
    p_timetable_slot_id: parsed.data.slotId,
    p_attendance_date: parsed.data.attendanceDate,
    p_exceptions: parsed.data.exceptions,
    p_client_mutation_id: parsed.data.clientMutationId,
    p_replaces_submission_id: parsed.data.replacesSubmissionId,
    p_source: parsed.data.source,
  });
  if (error) return { message: "Lesson attendance could not be saved. Confirm the lesson, learner entries and your current teaching access, then try again." };
  // Subject-period attendance is the authoritative source for the subject view
  // of absence reviews, so that dependent route must be invalidated too — the
  // lesson route alone leaves absence reviews on its previous payload.
  revalidatePath(`/attendance/lesson/${parsed.data.slotId}`);
  revalidatePath("/school/absence-reviews");
  return { success: true, message: parsed.data.replacesSubmissionId ? "Lesson attendance revision saved." : "Lesson attendance saved." };
}
