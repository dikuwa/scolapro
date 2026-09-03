import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TimetableWorkspace = {
  grades: { id: string; name: string }[];
  classes: { id: string; name: string; gradeId: string; gradeName: string }[];
  staff: { id: string; name: string; employeeNumber: string | null }[];
  subjects: { id: string; code: string; name: string; used: boolean }[];
  offerings: { id: string; subjectId: string; subjectName: string; gradeId: string; gradeName: string; periodsPerCycle: number }[];
  allocations: { id: string; offeringId: string; classId: string; className: string; staffId: string; staffName: string; staffCode: string | null; subjectName: string; gradeName: string; activeFrom: string; activeTo: string | null }[];
  periods: { id: string; number: number; name: string; startsAt: string | null; endsAt: string | null; isTeaching: boolean }[];
  rooms: { id: string; code: string; name: string; block: string | null; capacity: number | null }[];
  slots: { id: string; cycle: string; weekday: number; periodId: string; periodName: string; periodNumber: number; classId: string; className: string; allocationId: string; staffId: string; staffName: string; staffCode: string | null; subjectName: string; roomId: string | null; roomLabel: string | null }[];
};

function one<T>(value: T[] | T | null | undefined): T | null { return (Array.isArray(value) ? value[0] : value) ?? null; }
function isEffectiveOn(date: string, startsOn: string, endsOn: string | null): boolean {
  return startsOn <= date && (!endsOn || endsOn >= date);
}
function isCurrentOrFuture(date: string, endsOn: string | null): boolean {
  return !endsOn || endsOn >= date;
}

export async function getTimetableWorkspace(schoolId: string, academicYear: number): Promise<TimetableWorkspace> {
  const supabase = await createSupabaseServerClient();
  const [gradesResult, classesResult, membershipsResult, staffAssignmentsResult, subjectsResult, offeringsResult, allocationsResult, periodsResult, roomsResult, slotsResult] = await Promise.all([
    supabase.from("grades").select("id,display_name").eq("school_id", schoolId).eq("academic_year", academicYear).order("grade_code"),
    supabase.from("register_classes").select("id,display_name,grade_id,grades(display_name)").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name"),
    supabase.from("school_memberships").select("staff_member_id,active_from,active_to,staff_members(id,first_name,last_name,employee_number,status)").eq("school_id", schoolId),
    supabase.from("staff_school_assignments").select("staff_member_id,staff_code,effective_from,effective_to,staff_members(id,first_name,last_name,employee_number,status)").eq("school_id", schoolId),
    supabase.from("subjects").select("id,subject_code,display_name").eq("school_id", schoolId).eq("status", "active").order("display_name"),
    supabase.from("subject_offerings").select("id,subject_id,grade_id,periods_per_cycle,subjects(display_name),grades(display_name)").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "active"),
    supabase.from("teacher_allocations").select("id,subject_offering_id,register_class_id,staff_member_id,active_from,active_to,subject_offerings(subjects(display_name),grades(display_name)),register_classes(display_name),staff_members(first_name,last_name)").eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("timetable_periods").select("id,period_number,display_name,starts_at,ends_at,is_teaching_period").eq("school_id", schoolId).eq("academic_year", academicYear).order("period_number"),
    supabase.from("school_rooms").select("id,room_code,display_name,block_name,capacity").eq("school_id", schoolId).eq("status", "active").order("display_name"),
    supabase.from("timetable_slots").select("id,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,room_id,room_label,timetable_periods(display_name,period_number),register_classes(display_name),teacher_allocations(staff_member_id,active_from,active_to,staff_members(first_name,last_name),subject_offerings(subjects(display_name)))").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "active").order("weekday").order("period_id"),
  ]);

  const error = gradesResult.error || classesResult.error || membershipsResult.error || staffAssignmentsResult.error || subjectsResult.error || offeringsResult.error || allocationsResult.error || periodsResult.error || roomsResult.error || slotsResult.error;
  if (error) throw new Error(`Unable to load timetable workspace: ${error.message}`);

  const today = new Date().toISOString().slice(0, 10);
  const eligibleStaffMap = new Map<string, { id: string; name: string; employeeNumber: string | null }>();
  const currentStaffIds = new Set<string>();
  const staffCodeMap = new Map<string, string>();
  const addEligibleStaff = (staff: { id: string; first_name: string; last_name: string; employee_number: string | null; status: string } | null) => {
    if (!staff || staff.status !== "active") return;
    eligibleStaffMap.set(staff.id, { id: staff.id, name: [staff.first_name, staff.last_name].filter(Boolean).join(" "), employeeNumber: staff.employee_number });
  };

  for (const membership of membershipsResult.data ?? []) {
    const staff = one(membership.staff_members);
    if (isCurrentOrFuture(today, membership.active_to)) addEligibleStaff(staff);
    if (staff?.status === "active" && isEffectiveOn(today, membership.active_from, membership.active_to)) currentStaffIds.add(staff.id);
  }
  for (const assignment of staffAssignmentsResult.data ?? []) {
    const staff = one(assignment.staff_members);
    const current = staff?.status === "active" && isEffectiveOn(today, assignment.effective_from, assignment.effective_to);
    if (isCurrentOrFuture(today, assignment.effective_to)) addEligibleStaff(staff);
    if (current) {
      currentStaffIds.add(staff.id);
      if (assignment.staff_member_id && assignment.staff_code) staffCodeMap.set(assignment.staff_member_id, assignment.staff_code);
    } else if (isCurrentOrFuture(today, assignment.effective_to) && assignment.staff_member_id && assignment.staff_code && !staffCodeMap.has(assignment.staff_member_id)) {
      staffCodeMap.set(assignment.staff_member_id, assignment.staff_code);
    }
  }

  const usedSubjectIds = new Set((offeringsResult.data ?? []).map((item) => item.subject_id));
  const planningAllocations = (allocationsResult.data ?? []).filter((item) =>
    isCurrentOrFuture(today, item.active_to) && eligibleStaffMap.has(item.staff_member_id)
  );
  const currentSlots = (slotsResult.data ?? []).filter((item) => {
    const allocation = one(item.teacher_allocations);
    return allocation
      ? isEffectiveOn(today, allocation.active_from, allocation.active_to) && currentStaffIds.has(allocation.staff_member_id)
      : false;
  });

  return {
    grades: (gradesResult.data ?? []).map((grade) => ({ id: grade.id, name: grade.display_name })),
    classes: (classesResult.data ?? []).map((item) => ({ id: item.id, name: item.display_name, gradeId: item.grade_id, gradeName: one(item.grades)?.display_name ?? "Grade" })),
    staff: Array.from(eligibleStaffMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    subjects: (subjectsResult.data ?? []).map((subject) => ({ id: subject.id, code: subject.subject_code, name: subject.display_name, used: usedSubjectIds.has(subject.id) })),
    offerings: (offeringsResult.data ?? []).map((item) => ({ id: item.id, subjectId: item.subject_id, subjectName: one(item.subjects)?.display_name ?? "Subject", gradeId: item.grade_id, gradeName: one(item.grades)?.display_name ?? "Grade", periodsPerCycle: item.periods_per_cycle })),
    allocations: planningAllocations.map((item) => {
      const offering = one(item.subject_offerings); const subject = offering ? one(offering.subjects) : null; const grade = offering ? one(offering.grades) : null; const classRow = one(item.register_classes); const staff = one(item.staff_members);
      return { id: item.id, offeringId: item.subject_offering_id, classId: item.register_class_id, className: classRow?.display_name ?? "Class", staffId: item.staff_member_id, staffName: staff ? [staff.first_name, staff.last_name].filter(Boolean).join(" ") : "Teacher", staffCode: staffCodeMap.get(item.staff_member_id) ?? null, subjectName: subject?.display_name ?? "Subject", gradeName: grade?.display_name ?? "Grade", activeFrom: item.active_from, activeTo: item.active_to };
    }).sort((a, b) => a.activeFrom.localeCompare(b.activeFrom) || a.className.localeCompare(b.className)),
    periods: (periodsResult.data ?? []).map((item) => ({ id: item.id, number: item.period_number, name: item.display_name, startsAt: item.starts_at, endsAt: item.ends_at, isTeaching: item.is_teaching_period })),
    rooms: (roomsResult.data ?? []).map((item) => ({ id: item.id, code: item.room_code, name: item.display_name, block: item.block_name, capacity: item.capacity })),
    slots: currentSlots.map((item) => {
      const period = one(item.timetable_periods); const classRow = one(item.register_classes); const allocation = one(item.teacher_allocations); const staff = allocation ? one(allocation.staff_members) : null; const offering = allocation ? one(allocation.subject_offerings) : null; const subject = offering ? one(offering.subjects) : null; const staffId = allocation?.staff_member_id ?? "";
      return { id: item.id, cycle: item.cycle_code, weekday: item.weekday, periodId: item.period_id, periodName: period?.display_name ?? "Period", periodNumber: period?.period_number ?? 0, classId: item.register_class_id, className: classRow?.display_name ?? "Class", allocationId: item.teacher_allocation_id, staffId, staffName: staff ? [staff.first_name, staff.last_name].filter(Boolean).join(" ") : "Teacher", staffCode: staffCodeMap.get(staffId) ?? null, subjectName: subject?.display_name ?? "Subject", roomId: item.room_id, roomLabel: item.room_label };
    }),
  };
}
