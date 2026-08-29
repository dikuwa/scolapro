import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffDirectoryRow = {
  id: string;
  staffId: string | null;
  name: string;
  employeeNumber: string | null;
  staffCode: string | null;
  defaultRoomName: string | null;
  labels: string[];
  activeFrom: string;
  activeTo: string | null;
  hasAccount: boolean;
};

function relationValue<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function getSchoolStaffDirectory(schoolId: string): Promise<StaffDirectoryRow[]> {
  const supabase = await createSupabaseServerClient();
  const [assignmentsResult, membershipsResult] = await Promise.all([
    supabase
      .from("staff_school_assignments")
      .select("id,assignment_type,position_title,effective_from,effective_to,staff_member_id,staff_code,default_room_id,school_rooms(display_name),staff_members(id,employee_number,first_name,last_name)")
      .eq("school_id", schoolId)
      .order("effective_from", { ascending: false }),
    supabase
      .from("school_memberships")
      .select("id,role_key,active_from,active_to,user_id,staff_member_id,staff_members(id,employee_number,first_name,last_name)")
      .eq("school_id", schoolId)
      .order("active_from", { ascending: false }),
  ]);

  if (assignmentsResult.error || membershipsResult.error) throw new Error("Unable to load school staff directory.");

  const rows = new Map<string, StaffDirectoryRow>();
  for (const assignment of assignmentsResult.data ?? []) {
    const staff = relationValue(assignment.staff_members);
    const room = relationValue(assignment.school_rooms);
    if (!staff) continue;
    rows.set(staff.id, {
      id: assignment.id,
      staffId: staff.id,
      name: [staff.first_name, staff.last_name].filter(Boolean).join(" "),
      employeeNumber: staff.employee_number,
      staffCode: assignment.staff_code ?? null,
      defaultRoomName: room?.display_name ?? null,
      labels: [assignment.position_title || assignment.assignment_type],
      activeFrom: assignment.effective_from,
      activeTo: assignment.effective_to,
      hasAccount: false,
    });
  }

  for (const membership of membershipsResult.data ?? []) {
    const staff = relationValue(membership.staff_members);
    const key = staff?.id ?? `membership:${membership.id}`;
    const existing = rows.get(key);
    if (existing) {
      if (!existing.labels.includes(membership.role_key)) existing.labels.push(membership.role_key);
      existing.hasAccount = true;
      if (membership.active_from < existing.activeFrom) existing.activeFrom = membership.active_from;
      if (!membership.active_to || (existing.activeTo && membership.active_to > existing.activeTo)) existing.activeTo = membership.active_to;
      continue;
    }
    rows.set(key, {
      id: membership.id,
      staffId: staff?.id ?? null,
      name: staff ? [staff.first_name, staff.last_name].filter(Boolean).join(" ") : "Linked school user",
      employeeNumber: staff?.employee_number ?? null,
      staffCode: null,
      defaultRoomName: null,
      labels: [membership.role_key],
      activeFrom: membership.active_from,
      activeTo: membership.active_to,
      hasAccount: Boolean(membership.user_id),
    });
  }

  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
}
