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

export type StaffDirectoryResult = {
  rows: StaffDirectoryRow[];
  totalStaff: number;
  activeStaff: number;
  accountCount: number;
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

  const [directoryResult, summaryResult] = await Promise.all([
    supabase.rpc("list_staff_directory_page", {
      p_school_id: schoolId,
      p_query: options.query?.trim() || null,
      p_page: page,
      p_page_size: pageSize,
    }),
    supabase.rpc("get_staff_directory_summary", {
      p_school_id: schoolId,
      p_on_date: onDate,
    }),
  ]);

  if (directoryResult.error || summaryResult.error) throw new Error("Unable to load school staff directory.");

  const directoryRows = (directoryResult.data ?? []) as StaffDirectoryRpcRow[];
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
    })),
    totalStaff: Number(summary?.total_staff ?? 0),
    activeStaff: Number(summary?.active_staff ?? 0),
    accountCount: Number(summary?.account_count ?? 0),
    suggestedEmployeeNumber: summary?.suggested_employee_number ?? "EMP-001",
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(filteredCount / pageSize)),
    filteredCount,
  };
}