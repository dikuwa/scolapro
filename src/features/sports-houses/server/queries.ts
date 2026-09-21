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

type StaffAssignmentRow = {
  staff_member_id: string;
  house_id: string;
  role_key: string;
  assignment_source: string;
  is_locked: boolean;
  assigned_at: string;
};

type StaffIdentityRow = {
  id: string;
  first_name: string;
  last_name: string;
  employee_number: string | null;
};

const IDENTITY_READ_CHUNK_SIZE = 200;

type IdentityReadError = {
  code?: string;
};

async function readIdentityRowsInChunks<T>(
  ids: string[],
  readChunk: (chunk: string[]) => Promise<{ data: T[] | null; error: IdentityReadError | null }>,
) {
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];

  for (let offset = 0; offset < uniqueIds.length; offset += IDENTITY_READ_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + IDENTITY_READ_CHUNK_SIZE);
    const result = await readChunk(chunk);
    if (result.error) return { data: [] as T[], error: result.error };
    rows.push(...(result.data ?? []));
  }

  return { data: rows, error: null };
}

export async function getSportsHousesWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const currentYear = Number(getNamibiaDateKey().slice(0, 4));
  const yearStart = `${academicYear}-01-01`;
  const yearEnd = `${academicYear}-12-31`;

  const [
    schoolResult,
    housesResult,
    settingsResult,
    ageGroupsResult,
    learnerRosterResult,
    learnerAssignmentsYearsResult,
    staffAssignmentsResult,
    staffAssignmentYearsResult,
    staffPlacementsResult,
  ] = await Promise.all([
    supabase.from("schools").select("id,name").eq("id", schoolId).maybeSingle(),
    supabase.from("sports_houses").select("id,name,short_code,color_hex,sort_order,status,created_by_user_id,created_at,updated_at").eq("school_id", schoolId).order("sort_order").order("name"),
    supabase.from("sports_year_settings").select("academic_year,age_reference_date,assignment_continuity").eq("school_id", schoolId).order("academic_year", { ascending: false }),
    supabase.from("sports_age_groups").select("id,label,min_age,max_age,sort_order,status").eq("school_id", schoolId).order("sort_order").order("label"),
    supabase.rpc("get_sports_house_learner_roster", { p_school_id: schoolId, p_academic_year: academicYear }),
    supabase.from("sports_learner_house_assignments").select("academic_year").eq("school_id", schoolId),
    supabase.from("sports_staff_house_assignments").select("staff_member_id,house_id,role_key,assignment_source,is_locked,assigned_at").eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("sports_staff_house_assignments").select("academic_year").eq("school_id", schoolId),
    supabase.from("staff_school_assignments").select("staff_member_id,effective_from,effective_to").eq("school_id", schoolId).lte("effective_from", yearEnd).or(`effective_to.is.null,effective_to.gte.${yearStart}`),
  ]);

  const readIssues = [
    ["school context", schoolResult.error],
    ["house configuration", housesResult.error],
    ["year settings", settingsResult.error],
    ["age groups", ageGroupsResult.error],
    ["learner roster", learnerRosterResult.error],
    ["learner assignment history", learnerAssignmentsYearsResult.error],
    ["staff assignments", staffAssignmentsResult.error],
    ["staff assignment history", staffAssignmentYearsResult.error],
    ["staff placements", staffPlacementsResult.error],
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
    ["staff assignments", staffAssignmentsResult.error],
    ["staff placements", staffPlacementsResult.error],
  ].find(([, error]) => error);
  if (fatalIssue) throw new Error(`Unable to load Sports / Houses (${fatalIssue[0]}).`);

  if (!schoolResult.data) throw new Error("Sports / Houses school context is unavailable.");

  const staffPlacementIds = [...new Set((staffPlacementsResult.data ?? []).map((row) => row.staff_member_id))];
  const assignedStaffIds = [...new Set(((staffAssignmentsResult.data ?? []) as StaffAssignmentRow[]).map((row) => row.staff_member_id))];
  const staffIds = [...new Set([...staffPlacementIds, ...assignedStaffIds])];
  const staffIdentityResult = await readIdentityRowsInChunks<StaffIdentityRow>(
    staffIds,
    async (chunk) => supabase.from("staff_members").select("id,first_name,last_name,employee_number").in("id", chunk),
  );
  if (staffIdentityResult.error) {
    console.error("[sports-houses] staff identities read failed", { code: staffIdentityResult.error.code ?? "unknown" });
    throw new Error("Unable to load staff identities for Sports / Houses.");
  }

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

  const staffIdentityMap = new Map((staffIdentityResult.data ?? []).map((row) => [row.id, row]));
  const staffAssignments = new Map(
    ((staffAssignmentsResult.data ?? []) as StaffAssignmentRow[]).map((row) => [row.staff_member_id, row]),
  );
  const staff: SportsStaff[] = staffIds.map((staffId) => {
    const identity = staffIdentityMap.get(staffId);
    const assignment = staffAssignments.get(staffId);
    const house = assignment ? houseMap.get(assignment.house_id) : null;
    return {
      id: staffId,
      name: identity ? `${identity.first_name} ${identity.last_name}`.trim() : "Staff member",
      employeeNumber: identity?.employee_number ?? null,
      houseId: assignment?.house_id ?? null,
      houseName: house?.name ?? null,
      roleKey: assignment?.role_key ?? null,
      assignmentSource: assignment?.assignment_source ?? null,
      isLocked: assignment?.is_locked ?? false,
      assignedAt: assignment?.assigned_at ?? null,
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
    ...(learnerAssignmentsYearsResult.data ?? []).map((row) => row.academic_year),
    ...(staffAssignmentYearsResult.data ?? []).map((row) => row.academic_year),
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
