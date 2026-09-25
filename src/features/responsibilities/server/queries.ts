import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolDutyCapability = {
  dutyKey: string;
  label: string;
  description: string;
  navigationKey: string;
};

export type SchoolDutyAssignment = {
  assignmentId: string;
  staffMemberId: string;
  staffName: string;
  employeeNumber: string | null;
  dutyKey: string;
  dutyLabel: string;
  navigationKey: string;
  activeFrom: string;
  activeTo: string | null;
  currentlyEffective: boolean;
};

export type SchoolDutyStaffCandidate = {
  staffMemberId: string;
  staffName: string;
  employeeNumber: string | null;
};

type RpcRow = Record<string, unknown>;

export async function getSchoolDutyWorkspace(schoolId: string, onDate: string) {
  const supabase = await createSupabaseServerClient();
  const [capabilitiesResult, assignmentsResult, staffResult] = await Promise.all([
    supabase.rpc("list_school_duty_capabilities"),
    supabase.rpc("list_school_duty_assignments", {
      p_school_id: schoolId,
      p_on_date: onDate,
    }),
    supabase.rpc("list_school_duty_staff_candidates", {
      p_school_id: schoolId,
      p_on_date: onDate,
    }),
  ]);

  if (capabilitiesResult.error || assignmentsResult.error || staffResult.error) {
    throw new Error("Unable to load delegated responsibilities.");
  }

  const capabilities: SchoolDutyCapability[] = ((capabilitiesResult.data ?? []) as RpcRow[]).map((row) => ({
    dutyKey: String(row.duty_key),
    label: String(row.label),
    description: String(row.description),
    navigationKey: String(row.navigation_key),
  }));

  const assignments: SchoolDutyAssignment[] = ((assignmentsResult.data ?? []) as RpcRow[]).map((row) => ({
    assignmentId: String(row.assignment_id),
    staffMemberId: String(row.staff_member_id),
    staffName: String(row.staff_name),
    employeeNumber: row.employee_number ? String(row.employee_number) : null,
    dutyKey: String(row.duty_key),
    dutyLabel: String(row.duty_label),
    navigationKey: String(row.navigation_key),
    activeFrom: String(row.active_from),
    activeTo: row.active_to ? String(row.active_to) : null,
    currentlyEffective: Boolean(row.currently_effective),
  }));

  const staff: SchoolDutyStaffCandidate[] = ((staffResult.data ?? []) as RpcRow[]).map((row) => ({
    staffMemberId: String(row.staff_member_id),
    staffName: String(row.staff_name),
    employeeNumber: row.employee_number ? String(row.employee_number) : null,
  }));

  return { capabilities, assignments, staff };
}
