import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffLeaveTypeOption = {
  id: string;
  code: string;
  name: string;
  tracksBalance: boolean;
  evidenceRequirement: "none" | "optional" | "required";
  sourceReference: string | null;
  status: "active" | "inactive";
};

export type StaffLeaveRequestRow = {
  id: string;
  staffMemberId: string;
  staffName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  tracksBalance: boolean;
  startsOn: string;
  endsOn: string;
  requestedUnits: number;
  approvedUnits: number | null;
  status: "submitted" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  decisionNote: string | null;
  submittedAt: string;
  decidedAt: string | null;
  cancelledAt: string | null;
  balanceUnits: number;
  absenceStatus: "active" | "cancelled" | null;
  timetableSlotsAffected: number;
  evidenceCount: number;
};

export type StaffLeaveStaffOption = {
  id: string;
  name: string;
  employeeNumber: string | null;
};

export type StaffLeaveWorkspace = {
  types: StaffLeaveTypeOption[];
  requests: StaffLeaveRequestRow[];
  staff: StaffLeaveStaffOption[];
  balances: Array<{
    staffMemberId: string;
    leaveTypeId: string;
    units: number;
  }>;
};

export async function getStaffLeaveWorkspace(
  schoolId: string,
  asOf: string,
  canManage: boolean,
): Promise<StaffLeaveWorkspace> {
  const supabase = await createSupabaseServerClient();

  const [typesResult, requestsResult, ledgerResult] = await Promise.all([
    supabase
      .from("staff_leave_types")
      .select("id,code,display_name,tracks_balance,evidence_requirement,source_reference,status")
      .eq("school_id", schoolId)
      .order("display_name"),
    supabase.rpc("list_staff_leave_workspace", {
      p_school_id: schoolId,
      p_as_of: asOf,
    }),
    supabase
      .from("staff_leave_ledger_entries")
      .select("staff_member_id,leave_type_id,units_delta,effective_on")
      .eq("school_id", schoolId)
      .lte("effective_on", asOf),
  ]);

  const error = typesResult.error || requestsResult.error || ledgerResult.error;
  if (error) throw new Error("Unable to load staff leave and absence data.");

  let staffRows: StaffLeaveStaffOption[] = [];
  if (canManage) {
    const { data: assignments, error: staffError } = await supabase
      .from("staff_school_assignments")
      .select("staff_member_id,effective_from,effective_to,staff_members(id,first_name,last_name,employee_number)")
      .eq("school_id", schoolId)
      .lte("effective_from", asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`)
      .order("effective_from", { ascending: false });

    if (staffError) throw new Error("Unable to load staff for leave management.");

    const seen = new Set<string>();
    staffRows = (assignments ?? []).flatMap((item) => {
      const staff = Array.isArray(item.staff_members) ? item.staff_members[0] : item.staff_members;
      if (!staff?.id || seen.has(staff.id)) return [];
      seen.add(staff.id);
      return [{
        id: staff.id,
        name: [staff.first_name, staff.last_name].filter(Boolean).join(" "),
        employeeNumber: staff.employee_number ?? null,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  const balances = new Map<string, number>();
  for (const row of ledgerResult.data ?? []) {
    const key = `${row.staff_member_id}:${row.leave_type_id}`;
    balances.set(key, (balances.get(key) ?? 0) + Number(row.units_delta ?? 0));
  }

  return {
    types: (typesResult.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.display_name,
      tracksBalance: Boolean(row.tracks_balance),
      evidenceRequirement: row.evidence_requirement as StaffLeaveTypeOption["evidenceRequirement"],
      sourceReference: row.source_reference ?? null,
      status: row.status as StaffLeaveTypeOption["status"],
    })),
    requests: ((requestsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.request_id),
      staffMemberId: String(row.staff_member_id),
      staffName: String(row.staff_name),
      leaveTypeId: String(row.leave_type_id),
      leaveTypeName: String(row.leave_type_name),
      tracksBalance: Boolean(row.tracks_balance),
      startsOn: String(row.starts_on),
      endsOn: String(row.ends_on),
      requestedUnits: Number(row.requested_units),
      approvedUnits: row.approved_units === null ? null : Number(row.approved_units),
      status: String(row.status) as StaffLeaveRequestRow["status"],
      reason: row.reason ? String(row.reason) : null,
      decisionNote: row.decision_note ? String(row.decision_note) : null,
      submittedAt: String(row.submitted_at),
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
      balanceUnits: Number(row.balance_units ?? 0),
      absenceStatus: row.absence_status ? String(row.absence_status) as StaffLeaveRequestRow["absenceStatus"] : null,
      timetableSlotsAffected: Number(row.timetable_slots_affected ?? 0),
      evidenceCount: Number(row.evidence_count ?? 0),
    })),
    staff: staffRows,
    balances: [...balances.entries()].map(([key, units]) => {
      const [staffMemberId, leaveTypeId] = key.split(":");
      return { staffMemberId, leaveTypeId, units };
    }),
  };
}
