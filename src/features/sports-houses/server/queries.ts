import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLearnerName } from "@/lib/person-name";
import { getNamibiaDateKey } from "@/lib/namibia-date";

export type SportsHouse = {
  id: string;
  name: string;
  shortCode: string | null;
  colorHex: string | null;
  sortOrder: number;
  status: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SportsAgeGroup = {
  id: string;
  label: string;
  minAge: number | null;
  maxAge: number | null;
  sortOrder: number;
  status: string;
};

export type SportsLearner = {
  id: string;
  name: string;
  admissionNumber: string | null;
  houseId: string | null;
  houseName: string | null;
  houseColorHex: string | null;
  assignmentSource: string | null;
  isLocked: boolean;
  assignedAt: string | null;
  ageOnReferenceDate: number | null;
  ageGroupLabel: string | null;
  sex: string | null;
  gradeId: string | null;
  gradeName: string | null;
  registerClassId: string | null;
  registerClassName: string | null;
};

export type SportsAgeGroupSourceProposal = {
  id: string;
  sourceKey: string;
  sourceTitle: string;
  labels: string[];
  status: string;
  provenance: Record<string, unknown>;
};

export type SportsStaff = {
  id: string;
  name: string;
  employeeNumber: string | null;
  houseId: string | null;
  houseName: string | null;
  roleKey: string | null;
  assignmentSource: string | null;
  isLocked: boolean;
  assignedAt: string | null;
};

export type SportsYearSettings = {
  academicYear: number;
  ageReferenceDate: string;
  assignmentContinuity: string;
};

type LearnerRosterRow = {
  learner_id: string;
  first_names: string;
  surname: string;
  admission_number: string | null;
  house_id: string | null;
  house_name: string | null;
  house_color_hex: string | null;
  assignment_source: string | null;
  is_locked: boolean;
  assigned_at: string | null;
  age_on_reference_date: number | null;
  age_group_label: string | null;
  sex: string | null;
  grade_id: string | null;
  grade_name: string | null;
  register_class_id: string | null;
  register_class_name: string | null;
};

type AssignmentYearRow = {
  academic_year: number;
};

type StaffRosterRow = {
  staff_member_id: string;
  first_name: string | null;
  last_name: string | null;
  employee_number: string | null;
  house_id: string | null;
  role_key: string | null;
  assignment_source: string | null;
  is_locked: boolean | null;
  assigned_at: string | null;
};

type WorkspaceMetadataRow = {
  school: { id: string; name: string } | null;
  houses: Array<{
    id: string;
    name: string;
    short_code: string | null;
    color_hex: string | null;
    sort_order: number;
    status: string;
    created_by_user_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  settings: Array<{
    academic_year: number;
    age_reference_date: string;
    assignment_continuity: string;
  }>;
  age_groups: Array<{
    id: string;
    label: string;
    min_age: number | null;
    max_age: number | null;
    sort_order: number;
    status: string;
  }>;
};

export async function getSportsHousesWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const currentYear = Number(getNamibiaDateKey().slice(0, 4));
  const [
    metadataResult,
    learnerRosterResult,
    assignmentYearsResult,
    staffRosterResult,
    sourceProposalResult,
  ] = await Promise.all([
    supabase.rpc("get_sports_house_workspace_metadata", { p_school_id: schoolId }),
    supabase
      .rpc("get_sports_house_operational_learner_roster", { p_school_id: schoolId, p_academic_year: academicYear })
      .select(
        "learner_id,first_names,surname,admission_number,sex,grade_id,grade_name,register_class_id,register_class_name,house_id,house_name,house_color_hex,assignment_source,is_locked,assigned_at,age_on_reference_date,age_group_label",
      ),
    supabase.rpc("get_sports_house_assignment_years", { p_school_id: schoolId }),
    supabase.rpc("get_sports_house_staff_roster", { p_school_id: schoolId, p_academic_year: academicYear }),
    supabase
      .from("sports_age_group_source_proposals")
      .select("id,source_key,source_title,labels,status,provenance")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("created_at"),
  ]);

  const readIssues = [
    ["workspace metadata", metadataResult.error],
    ["learner roster", learnerRosterResult.error],
    ["assignment-year history", assignmentYearsResult.error],
    ["staff roster", staffRosterResult.error],
    ["age-group source proposals", sourceProposalResult.error],
  ] as const;
  for (const [dependency, error] of readIssues) {
    if (error) console.error(`[sports-houses] ${dependency} read failed`, { code: error.code ?? "unknown" });
  }

  // The governed roster read returns the complete eligible learner workspace in
  // one school/year-scoped call. It is required just as the previous enrolment
  // and learner-identity reads were required.
  const fatalIssue = [
    ["workspace metadata", metadataResult.error],
    ["learner roster", learnerRosterResult.error],
    ["staff roster", staffRosterResult.error],
  ].find(([, error]) => error);
  if (fatalIssue) throw new Error(`Unable to load Sports / Houses (${fatalIssue[0]}).`);

  const metadata = metadataResult.data as WorkspaceMetadataRow | null;
  if (!metadata?.school) throw new Error("Sports / Houses school context is unavailable.");

  const houses: SportsHouse[] = (metadata.houses ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    colorHex: row.color_hex,
    sortOrder: row.sort_order,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const houseMap = new Map(houses.map((house) => [house.id, house]));

  const ageGroups: SportsAgeGroup[] = (metadata.age_groups ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    minAge: row.min_age,
    maxAge: row.max_age,
    sortOrder: row.sort_order,
    status: row.status,
  }));

  const learners: SportsLearner[] = ((learnerRosterResult.data ?? []) as LearnerRosterRow[]).map((row) => ({
    id: row.learner_id,
    name: formatLearnerName(row.first_names, row.surname),
    admissionNumber: row.admission_number,
    houseId: row.house_id,
    houseName: row.house_name,
    houseColorHex: row.house_color_hex,
    assignmentSource: row.assignment_source,
    isLocked: row.is_locked,
    assignedAt: row.assigned_at,
    ageOnReferenceDate: row.age_on_reference_date,
    ageGroupLabel: row.age_group_label,
    sex: row.sex,
    gradeId: row.grade_id,
    gradeName: row.grade_name,
    registerClassId: row.register_class_id,
    registerClassName: row.register_class_name,
  })).sort((a, b) => a.name.localeCompare(b.name));

  const staff: SportsStaff[] = ((staffRosterResult.data ?? []) as StaffRosterRow[]).map((row) => {
    const house = row.house_id ? houseMap.get(row.house_id) : null;
    const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    return {
      id: row.staff_member_id,
      name: name || "Staff member",
      employeeNumber: row.employee_number,
      houseId: row.house_id,
      houseName: house?.name ?? null,
      roleKey: row.role_key,
      assignmentSource: row.assignment_source,
      isLocked: row.is_locked ?? false,
      assignedAt: row.assigned_at,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const sourceAgeGroupProposals: SportsAgeGroupSourceProposal[] = (sourceProposalResult.data ?? []).map((row) => ({
    id: row.id,
    sourceKey: row.source_key,
    sourceTitle: row.source_title,
    labels: Array.isArray(row.labels) ? row.labels.map(String) : [],
    status: row.status,
    provenance: row.provenance && typeof row.provenance === "object" && !Array.isArray(row.provenance)
      ? row.provenance as Record<string, unknown>
      : {},
  }));

  const settings: SportsYearSettings[] = (metadata.settings ?? []).map((row) => ({
    academicYear: row.academic_year,
    ageReferenceDate: row.age_reference_date,
    assignmentContinuity: row.assignment_continuity,
  }));
  const yearSet = new Set<number>([
    currentYear,
    academicYear,
    ...settings.map((row) => row.academicYear),
    ...((assignmentYearsResult.data ?? []) as AssignmentYearRow[]).map((row) => row.academic_year),
  ]);

  return {
    schoolId,
    schoolName: metadata.school.name,
    academicYear,
    years: [...yearSet].filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2200).sort((a, b) => b - a),
    houses,
    ageGroups,
    learners,
    staff,
    yearSettings: settings.find((item) => item.academicYear === academicYear) ?? null,
    sourceAgeGroupProposals,
    learnerAssignedCount: learners.filter((item) => item.houseId).length,
    learnerUnassignedCount: learners.filter((item) => !item.houseId).length,
    staffAssignedCount: staff.filter((item) => item.houseId).length,
    staffUnassignedCount: staff.filter((item) => !item.houseId).length,
  };
}
