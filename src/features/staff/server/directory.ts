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
  linkedUserId: string | null;
  pendingInvitationId: string | null;
  pendingInvitationStatus: string | null;
  activeRoles: { id: string; roleKey: string; activeFrom: string; activeTo: string | null }[];
  operationalHodDesignation: { id: string; effectiveFrom: string } | null;
  plannedRoles: { id: string; roleKey: string; effectiveFrom: string; effectiveTo: string | null; revokedAt: string | null }[];
};

export type StaffDirectoryResult = {
  rows: StaffDirectoryRow[];
  totalStaff: number;
  activeStaff: number;
  accountCount: number;
  operationalHodReady: boolean;
  suggestedEmployeeNumber: string;
  page: number;
  pageSize: number;
  pageCount: number;
  filteredCount: number;
};

type StaffDirectoryRpcRow = {
  row_id: string;
  staff_id: string | null;
  staff_name: string;
  employee_number: string | null;
  staff_code: string | null;
  default_room_name: string | null;
  labels: string[] | null;
  active_from: string;
  active_to: string | null;
  has_account: boolean;
  total_count: number | string;
  linked_user_id: string | null;
  pending_invitation_id: string | null;
  pending_invitation_status: string | null;
  active_roles: { id: string; roleKey: string; activeFrom: string; activeTo: string | null }[] | null;
};

type StaffSummaryRpcRow = {
  total_staff: number | string;
  active_staff: number | string;
  account_count: number | string;
  suggested_employee_number: string;
};

export async function getSchoolStaffDirectory(
  schoolId: string,
  options: { query?: string; page?: number; pageSize?: number; onDate?: string } = {},
): Promise<StaffDirectoryResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100);
  const onDate = options.onDate ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  const [directoryResult, summaryResult, designationResult] = await Promise.all([
    supabase.rpc("list_staff_access_directory_page", {
      p_school_id: schoolId,
      p_query: options.query?.trim() || null,
      p_page: page,
      p_page_size: pageSize,
    }),
    supabase.rpc("get_staff_directory_summary", {
      p_school_id: schoolId,
      p_on_date: onDate,
    }),
    supabase.from("staff_operational_hod_designations")
      .select("id,staff_member_id,effective_from")
      .eq("school_id", schoolId)
      .is("effective_to", null),
  ]);

  // A preview may run before its additive database migration is applied.
  // Keep the existing staff directory readable, while HOD designation writes
  // remain unavailable until the migration is deployed. Never mask other errors.
  const designationTableMissing = designationResult.error &&
    (designationResult.error.code === "42P01" ||
      designationResult.error.code === "PGRST205" ||
      designationResult.error.code === "PGRST116" && /schema cache/i.test(designationResult.error.message));
  if (directoryResult.error || summaryResult.error || (designationResult.error && !designationTableMissing)) {
    throw new Error("Unable to load school staff directory.");
  }
  const openHodDesignationByStaff = new Map(
    (designationResult.data ?? []).map((designation) => [
      designation.staff_member_id,
      { id: designation.id, effectiveFrom: designation.effective_from },
    ]),
  );

  const directoryRows = (directoryResult.data ?? []) as StaffDirectoryRpcRow[];
  const plannedRoleResult = await supabase.rpc("list_staff_planned_roles", {
    p_school_id: schoolId,
    p_staff_ids: directoryRows.map((row) => row.staff_id).filter((id): id is string => Boolean(id)),
  });
  const planningMigrationPending = plannedRoleResult.error &&
    (plannedRoleResult.error.code === "PGRST202" || plannedRoleResult.error.code === "42883");
  if (plannedRoleResult.error && !planningMigrationPending) {
    throw new Error("Unable to read staff role planning.");
  }
  const plannedByStaff = new Map<string, { id: string; roleKey: string; effectiveFrom: string; effectiveTo: string | null; revokedAt: string | null }[]>();
  for (const plan of plannedRoleResult.data ?? []) {
    const existing = plannedByStaff.get(plan.staff_member_id) ?? [];
    existing.push({ id: plan.id, roleKey: plan.role_key, effectiveFrom: plan.effective_from, effectiveTo: plan.effective_to, revokedAt: plan.revoked_at });
    plannedByStaff.set(plan.staff_member_id, existing);
  }

  const summary = ((summaryResult.data ?? [])[0] ?? null) as StaffSummaryRpcRow | null;
  const filteredCount = directoryRows.length ? Number(directoryRows[0].total_count) : 0;

  return {
    rows: directoryRows.map((row) => ({
      id: row.row_id,
      staffId: row.staff_id,
      name: row.staff_name,
      employeeNumber: row.employee_number,
      staffCode: row.staff_code,
      defaultRoomName: row.default_room_name,
      labels: Array.from(new Set(row.labels ?? [])),
      activeFrom: row.active_from,
      activeTo: row.active_to,
      hasAccount: row.has_account,
      linkedUserId: row.linked_user_id,
      pendingInvitationId: row.pending_invitation_id,
      pendingInvitationStatus: row.pending_invitation_status,
      activeRoles: row.active_roles ?? [],
      operationalHodDesignation: row.staff_id ? (openHodDesignationByStaff.get(row.staff_id) ?? null) : null,
      plannedRoles: row.staff_id ? (plannedByStaff.get(row.staff_id) ?? []) : [],
    })),
    totalStaff: Number(summary?.total_staff ?? 0),
    activeStaff: Number(summary?.active_staff ?? 0),
    accountCount: Number(summary?.account_count ?? 0),
    operationalHodReady: !designationTableMissing,
    suggestedEmployeeNumber: summary?.suggested_employee_number ?? "EMP-001",
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(filteredCount / pageSize)),
    filteredCount,
  };
}