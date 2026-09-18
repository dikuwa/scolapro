import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DirectorySchoolRow = {
  schoolId: string;
  schoolName: string;
  emisNumber: string;
  town: string;
  region: string;
  physicalAddress: string;
  postalAddress: string;
  telephone: string;
  fax: string;
  schoolEmail: string;
  schoolCellphone: string;
  principalName: string;
  principalPublicEmail: string;
  gradesOfferedDisplay: string;
  minimumGrade: string;
  maximumGrade: string;
  regionId: string | null;
  regionName: string;
  circuitId: string | null;
  circuitName: string;
  inspectorName: string;
  inspectorPhone: string;
  inspectorEmail: string;
  inspectorLastUpdatedAt: string | null;
  inspectorLastUpdatedBySchoolId: string | null;
  inspectorLastUpdatedBySchoolName: string;
};

export type SchoolDirectoryContact = { cellphone: string; principalPublicEmail: string };

/** Own-school public directory fields, read through the governed merge RPC's stored values. */
export async function getSchoolDirectoryContact(schoolId: string): Promise<SchoolDirectoryContact> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_school_directory_contact", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load the school's directory contact details.");
  const record = (data ?? {}) as Record<string, unknown>;
  return {
    cellphone: text(record.cellphone),
    principalPublicEmail: text(record.principal_public_email),
  };
}

export type DirectoryRegionOption = { value: string; label: string };
export type DirectoryCircuitOption = { value: string; label: string; helper?: string };

type DirectoryRpcRow = {
  school_id: string;
  school_name: string | null;
  emis_number: string | null;
  town: string | null;
  region: string | null;
  physical_address: string | null;
  postal_address: string | null;
  telephone: string | null;
  fax: string | null;
  school_email: string | null;
  school_cellphone: string | null;
  principal_name: string | null;
  principal_public_email: string | null;
  grades_offered_display: string | null;
  minimum_grade: string | null;
  maximum_grade: string | null;
  region_id: string | null;
  region_name: string | null;
  circuit_id: string | null;
  circuit_name: string | null;
  inspector_name: string | null;
  inspector_phone: string | null;
  inspector_email: string | null;
  inspector_last_updated_at: string | null;
  inspector_last_updated_by_school_id: string | null;
  inspector_last_updated_by_school_name: string | null;
};

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export async function searchSchoolDirectory(params: { search?: string; regionId?: string; circuitId?: string } = {}): Promise<DirectorySchoolRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_school_directory", {
    p_search: params.search?.trim() ? params.search.trim() : null,
    p_region_id: params.regionId || null,
    p_circuit_id: params.circuitId || null,
  });
  if (error) throw new Error("Unable to load the School Directory.");
  const rows = (data ?? []) as DirectoryRpcRow[];
  return rows.map((row) => ({
    schoolId: text(row.school_id),
    schoolName: text(row.school_name),
    emisNumber: text(row.emis_number),
    town: text(row.town),
    region: text(row.region),
    physicalAddress: text(row.physical_address),
    postalAddress: text(row.postal_address),
    telephone: text(row.telephone),
    fax: text(row.fax),
    schoolEmail: text(row.school_email),
    schoolCellphone: text(row.school_cellphone),
    principalName: text(row.principal_name),
    principalPublicEmail: text(row.principal_public_email),
    gradesOfferedDisplay: text(row.grades_offered_display),
    minimumGrade: text(row.minimum_grade),
    maximumGrade: text(row.maximum_grade),
    regionId: row.region_id,
    regionName: text(row.region_name),
    circuitId: row.circuit_id,
    circuitName: text(row.circuit_name),
    inspectorName: text(row.inspector_name),
    inspectorPhone: text(row.inspector_phone),
    inspectorEmail: text(row.inspector_email),
    inspectorLastUpdatedAt: row.inspector_last_updated_at,
    inspectorLastUpdatedBySchoolId: row.inspector_last_updated_by_school_id,
    inspectorLastUpdatedBySchoolName: text(row.inspector_last_updated_by_school_name),
  }));
}

/** Region/circuit filter options come only from the schools actually visible in the directory. */
export async function getDirectoryFilterOptions(): Promise<{ regions: DirectoryRegionOption[]; circuits: DirectoryCircuitOption[] }> {
  const rows = await searchSchoolDirectory();
  const regionMap = new Map<string, string>();
  const circuitMap = new Map<string, string>();
  for (const row of rows) {
    if (row.regionId && row.regionName) regionMap.set(row.regionId, row.regionName);
    else if (row.region && !regionMap.has(row.region)) regionMap.set(row.region, row.region);
    if (row.circuitId && row.circuitName) circuitMap.set(row.circuitId, row.circuitName);
  }
  return {
    regions: [...regionMap.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    circuits: [...circuitMap.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export type DirectoryViewerAuthority = {
  /** School-management roles that may mutate School Settings (existing model, not a new role). */
  canManageSchoolSettings: boolean;
  /** Only School Admin can establish staff account roles such as Principal. */
  canManageStaffAccess: boolean;
  currentSchoolId: string | null;
  /** Circuits the viewer's current school is currently assigned to. */
  editableCircuitIds: string[];
};

export async function getDirectoryViewerAuthority(): Promise<DirectoryViewerAuthority> {
  const context = await getUserContext();
  if (!context.user) {
    return { canManageSchoolSettings: false, canManageStaffAccess: false, currentSchoolId: null, editableCircuitIds: [] };
  }
  const canManageSchoolSettings = context.memberships.some((membership) =>
    ["school_admin", "principal", "deputy_principal"].includes(membership.roleKey),
  );
  const currentSchoolId = context.currentSchoolMembership?.schoolId ?? null;
  const canManageStaffAccess = Boolean(
    currentSchoolId &&
    context.memberships.some(
      (membership) => membership.schoolId === currentSchoolId && membership.roleKey === "school_admin",
    )
  );
  if (!canManageSchoolSettings || !currentSchoolId) {
    return { canManageSchoolSettings: false, canManageStaffAccess, currentSchoolId, editableCircuitIds: [] };
  }
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("school_network_assignments")
    .select("circuit_id")
    .eq("school_id", currentSchoolId)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`);
  return {
    canManageSchoolSettings: true,
    canManageStaffAccess,
    currentSchoolId,
    editableCircuitIds: [...new Set((data ?? []).map((row) => row.circuit_id).filter(Boolean))] as string[],
  };
}
