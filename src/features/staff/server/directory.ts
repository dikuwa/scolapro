import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffDirectoryRow = {
  membershipId: string;
  staffId: string | null;
  name: string;
  employeeNumber: string | null;
  roleKey: string;
  activeFrom: string;
  activeTo: string | null;
};

function relationValue<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function getSchoolStaffDirectory(schoolId: string): Promise<StaffDirectoryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("school_memberships")
    .select("id,role_key,active_from,active_to,staff_members(id,employee_number,first_name,last_name)")
    .eq("school_id", schoolId)
    .order("active_from", { ascending: false });

  if (error) throw new Error("Unable to load school staff directory.");

  return (data ?? []).map((membership) => {
    const staff = relationValue(membership.staff_members);
    const name = staff
      ? [staff.first_name, staff.last_name].filter(Boolean).join(" ")
      : "Linked school user";

    return {
      membershipId: membership.id,
      staffId: staff?.id ?? null,
      name,
      employeeNumber: staff?.employee_number ?? null,
      roleKey: membership.role_key,
      activeFrom: membership.active_from,
      activeTo: membership.active_to,
    };
  });
}
