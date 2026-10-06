import { createSupabaseServerClient } from "@/lib/supabase/server";

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function getSchoolStructure(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const [
    { data: school, error: schoolError },
    { data: anchor, error: anchorError },
    { data: grades, error: gradeError },
    { data: classes, error: classError },
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("timetable_cycle_mode,timetable_cycle_length")
      .eq("id", schoolId)
      .single(),
    supabase
      .from("timetable_cycle_anchors")
      .select("anchor_date,anchor_day")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .maybeSingle(),
    supabase
      .from("grades")
      .select("id,grade_code,display_name")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("grade_code"),
    supabase
      .from("register_classes")
      .select("id,class_code,display_name,grade_id,home_room_id,register_teacher_staff_id,home_rooms:home_room_id!left(id,room_code,display_name,block_name)")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("class_code"),
  ]);

  const academicStructureErrors = {
    school: schoolError,
    cycleAnchor: anchorError,
    grades: gradeError,
    registerClasses: classError,
  };

  if (Object.values(academicStructureErrors).some(Boolean)) {
    console.error("[academic-setup] structure query failure", academicStructureErrors);
    throw new Error("Unable to load school academic structure.");
  }

  const registerTeacherIds = [...new Set((classes ?? []).map((item) => item.register_teacher_staff_id).filter((id): id is string => Boolean(id)))];
  const registerTeacherNames = new Map<string, string>();
  if (registerTeacherIds.length) {
    const { data: staffRows, error: staffError } = await supabase
      .from("staff_members")
      .select("id,first_name,last_name")
      .in("id", registerTeacherIds);
    if (staffError) throw new Error("Unable to load register teachers.");
    for (const staff of staffRows ?? []) {
      registerTeacherNames.set(staff.id, `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim());
    }
  }

  return {
    timetableCycleMode: school?.timetable_cycle_mode === "rotating" ? "rotating" as const : "weekday" as const,
    timetableCycleLength: school?.timetable_cycle_length ?? 5,
    timetableCycleAnchorDate: anchor?.anchor_date ?? null,
    timetableCycleAnchorDay: anchor?.anchor_day ?? null,
    grades: (grades ?? []).map((grade) => ({
      id: grade.id,
      code: grade.grade_code,
      name: grade.display_name,
    })),
    classes: (classes ?? []).map((item) => {
      const room = one(item.home_rooms);
      return {
        id: item.id,
        code: item.class_code,
        name: item.display_name,
        gradeId: item.grade_id,
        registerTeacherStaffId: item.register_teacher_staff_id ?? null,
        registerTeacherName: item.register_teacher_staff_id ? registerTeacherNames.get(item.register_teacher_staff_id) ?? null : null,
        homeRoom: room
          ? { id: room.id, code: room.room_code, name: room.display_name, block: room.block_name }
          : null,
      };
    }),
  };
}


export type RegisterTeacherCandidate = {
  staffMemberId: string;
  staffName: string;
  employeeNumber: string | null;
};

export async function getRegisterTeacherCandidates(schoolId: string, onDate: string): Promise<RegisterTeacherCandidate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_school_duty_staff_candidates", {
    p_school_id: schoolId,
    p_on_date: onDate,
  });
  if (error) throw new Error("Unable to load register-teacher candidates.");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    staffMemberId: String(row.staff_member_id),
    staffName: String(row.staff_name),
    employeeNumber: row.employee_number ? String(row.employee_number) : null,
  }));
}
