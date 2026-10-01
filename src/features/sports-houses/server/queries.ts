import { createSupabaseServerClient } from "@/lib/supabase/server";
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

export async function getSportsHousesWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const currentYear = Number(getNamibiaDateKey().slice(0, 4));
  const [
    schoolResult,
    housesResult,
    settingsResult,
    ageGroupsResult,
    learnerRosterResult,
    assignmentYearsResult,
    staffRosterResult,
  ] = await Promise.all([
    supabase.from("schools").select("id,name").eq("id", schoolId).maybeSingle(),
    supabase.from("sports_houses").select("id,name,short_code,color_hex,sort_order,status,created_by_user_id,created_at,updated_at").eq("school_id", schoolId).order("sort_order").order("name"),
    supabase.from("sports_year_settings").select("academic_year,age_reference_date,assignment_continuity").eq("school_id", schoolId).order("academic_year", { ascending: false }),
    supabase.from("sports_age_groups").select("id,label,min_age,max_age,sort_order,status").eq("school_id", schoolId).order("sort_order").order("label"),
    supabase.rpc("get_sports_house_learner_roster", { p_school_id: schoolId, p_academic_year: academicYear }),
    supabase.rpc("get_sports_house_assignment_years", { p_school_id: schoolId }),
    supabase.rpc("get_sports_house_staff_roster", { p_school_id: schoolId, p_academic_year: academicYear }),
  ]);

  const readIssues = [
    ["school context", schoolResult.error],
    ["house configuration", housesResult.error],
    ["year settings", settingsResult.error],
    ["age groups", ageGroupsResult.error],
    ["learner roster", learnerRosterResult.error],
    ["assignment-year history", assignmentYearsResult.error],
    ["staff roster", staffRosterResult.error],
  ] as const;
  for (const [dependency, error] of readIssues) {
    if (error) console.error(`[sports-houses] ${dependency} read failed`, { code: error.code ?? "unknown" });
  }

  // The governed roster read returns the complete eligible learner workspace in
  // one school/year-scoped call. It is required just as the previous enrolment
  // and learner-identity reads were required.
  const fatalIssue = [
    ["school context", schoolResult.error],
    ["house configuration", housesResult.error],
    ["learner roster", learnerRosterResult.error],
    ["staff roster", staffRosterResult.error],
  ].find(([, error]) => error);
  if (fatalIssue) throw new Error(`Unable to load Sports / Houses (${fatalIssue[0]}).`);

  if (!schoolResult.data) throw new Error("Sports / Houses school context is unavailable.");

  const houses: SportsHouse[] = (housesResult.data ?? []).map((row) => ({
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

  const ageGroups: SportsAgeGroup[] = (ageGroupsResult.data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    minAge: row.min_age,
    maxAge: row.max_age,
    sortOrder: row.sort_order,
    status: row.status,
  }));

  const learners: SportsLearner[] = ((learnerRosterResult.data ?? []) as LearnerRosterRow[]).map((row) => ({
    id: row.learner_id,
    name: `${row.first_names} ${row.surname}`.trim() || "Learner",
    admissionNumber: row.admission_number,
    houseId: row.house_id,
    houseName: row.house_name,
    houseColorHex: row.house_color_hex,
    assignmentSource: row.assignment_source,
    isLocked: row.is_locked,
    assignedAt: row.assigned_at,
    ageOnReferenceDate: row.age_on_reference_date,
    ageGroupLabel: row.age_group_label,
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

  const settings: SportsYearSettings[] = (settingsResult.data ?? []).map((row) => ({
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
    schoolName: schoolResult.data.name,
    academicYear,
    years: [...yearSet].filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2200).sort((a, b) => b - a),
    houses,
    ageGroups,
    learners,
    staff,
    yearSettings: settings.find((item) => item.academicYear === academicYear) ?? null,
    learnerAssignedCount: learners.filter((item) => item.houseId).length,
    learnerUnassignedCount: learners.filter((item) => !item.houseId).length,
    staffAssignedCount: staff.filter((item) => item.houseId).length,
    staffUnassignedCount: staff.filter((item) => !item.houseId).length,
  };
}
