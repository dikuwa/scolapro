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
  house_id: string;
  house_name: string;
  house_color_hex: string | null;
  assignment_source: string;
  is_locked: boolean;
  assigned_at: string;
  age_on_reference_date: number | null;
  age_group_label: string | null;
};

type LearnerAssignmentRow = {
  learner_id: string;
  house_id: string;
  assignment_source: string;
  is_locked: boolean;
  assigned_at: string;
};

type StaffAssignmentRow = {
  staff_member_id: string;
  house_id: string;
  role_key: string;
  assignment_source: string;
  is_locked: boolean;
  assigned_at: string;
};

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
    currentLearnerAssignmentsResult,
    learnerAssignmentsYearsResult,
    staffAssignmentsResult,
    staffAssignmentYearsResult,
    enrolmentsResult,
    staffPlacementsResult,
  ] = await Promise.all([
    supabase.from("schools").select("id,name").eq("id", schoolId).maybeSingle(),
    supabase.from("sports_houses").select("id,name,short_code,color_hex,sort_order,status,created_by_user_id,created_at,updated_at").eq("school_id", schoolId).order("sort_order").order("name"),
    supabase.from("sports_year_settings").select("academic_year,age_reference_date,assignment_continuity").eq("school_id", schoolId).order("academic_year", { ascending: false }),
    supabase.from("sports_age_groups").select("id,label,min_age,max_age,sort_order,status").eq("school_id", schoolId).order("sort_order").order("label"),
    supabase.from("sports_house_learner_roster").select("learner_id,first_names,surname,house_id,house_name,house_color_hex,assignment_source,is_locked,assigned_at,age_on_reference_date,age_group_label").eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("sports_learner_house_assignments").select("learner_id,house_id,assignment_source,is_locked,assigned_at").eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("sports_learner_house_assignments").select("academic_year").eq("school_id", schoolId),
    supabase.from("sports_staff_house_assignments").select("staff_member_id,house_id,role_key,assignment_source,is_locked,assigned_at").eq("school_id", schoolId).eq("academic_year", academicYear),
    supabase.from("sports_staff_house_assignments").select("academic_year").eq("school_id", schoolId),
    supabase.from("enrolments").select("learner_id,admission_number").eq("school_id", schoolId).eq("academic_year", academicYear).in("status", ["current", "completed", "transferred"]),
    supabase.from("staff_school_assignments").select("staff_member_id,effective_from,effective_to").eq("school_id", schoolId).lte("effective_from", yearEnd).or(`effective_to.is.null,effective_to.gte.${yearStart}`),
  ]);

  const readIssues = [
    ["school context", schoolResult.error],
    ["house configuration", housesResult.error],
    ["year settings", settingsResult.error],
    ["age groups", ageGroupsResult.error],
    ["learner roster read model", learnerRosterResult.error],
    ["learner assignments", currentLearnerAssignmentsResult.error],
    ["learner assignment history", learnerAssignmentsYearsResult.error],
    ["staff assignments", staffAssignmentsResult.error],
    ["staff assignment history", staffAssignmentYearsResult.error],
    ["enrolments", enrolmentsResult.error],
    ["staff placements", staffPlacementsResult.error],
  ] as const;
  for (const [dependency, error] of readIssues) {
    if (error) console.error(`[sports-houses] ${dependency} read failed`, { code: error.code ?? "unknown" });
  }

  // History, configured cohorts and the roster view are optional read models. The
  // canonical current-school assignment reads below remain required for a populated
  // workspace; optional read-model failures must not turn an empty school into a fatal page.
  const fatalIssue = [
    ["school context", schoolResult.error],
    ["house configuration", housesResult.error],
    ["learner assignments", currentLearnerAssignmentsResult.error],
    ["staff assignments", staffAssignmentsResult.error],
    ["enrolments", enrolmentsResult.error],
    ["staff placements", staffPlacementsResult.error],
  ].find(([, error]) => error);
  if (fatalIssue) throw new Error(`Unable to load Sports / Houses (${fatalIssue[0]}).`);

  if (!schoolResult.data) throw new Error("Sports / Houses school context is unavailable.");

  const enrolments = enrolmentsResult.data ?? [];
  const learnerIds = [...new Set(enrolments.map((row) => row.learner_id))];
  const learnerIdentityResult = learnerIds.length
    ? await supabase.from("learners").select("id,first_names,surname").in("id", learnerIds)
    : { data: [] as Array<{ id: string; first_names: string; surname: string }>, error: null };
  if (learnerIdentityResult.error) throw new Error("Unable to load learner identities for Sports / Houses.");

  const staffPlacementIds = [...new Set((staffPlacementsResult.data ?? []).map((row) => row.staff_member_id))];
  const assignedStaffIds = [...new Set(((staffAssignmentsResult.data ?? []) as StaffAssignmentRow[]).map((row) => row.staff_member_id))];
  const staffIds = [...new Set([...staffPlacementIds, ...assignedStaffIds])];
  const staffIdentityResult = staffIds.length
    ? await supabase.from("staff_members").select("id,first_name,last_name,employee_number").in("id", staffIds)
    : { data: [] as Array<{ id: string; first_name: string; last_name: string; employee_number: string | null }>, error: null };
  if (staffIdentityResult.error) throw new Error("Unable to load staff identities for Sports / Houses.");

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

  const learnerRoster = new Map<string, LearnerRosterRow | LearnerAssignmentRow>();
  if (!learnerRosterResult.error) {
    for (const row of (learnerRosterResult.data ?? []) as LearnerRosterRow[]) learnerRoster.set(row.learner_id, row);
  } else {
    // The roster view is a read-model convenience. Fall back to the canonical assignment
    // table so an empty or freshly-migrated school still renders the normal workspace.
    for (const row of (currentLearnerAssignmentsResult.data ?? []) as LearnerAssignmentRow[]) learnerRoster.set(row.learner_id, row);
  }
  const learnerNames = new Map((learnerIdentityResult.data ?? []).map((row) => [row.id, `${row.first_names} ${row.surname}`.trim()]));
  const admissionNumbers = new Map(enrolments.map((row) => [row.learner_id, row.admission_number]));
  const learners: SportsLearner[] = learnerIds.map((learnerId) => {
    const assignment = learnerRoster.get(learnerId);
    const roster = assignment && "house_name" in assignment ? assignment : null;
    return {
      id: learnerId,
      name: learnerNames.get(learnerId) ?? "Learner",
      admissionNumber: admissionNumbers.get(learnerId) ?? null,
      houseId: assignment?.house_id ?? null,
      houseName: roster?.house_name ?? houseMap.get(assignment?.house_id ?? "")?.name ?? null,
      houseColorHex: roster?.house_color_hex ?? houseMap.get(assignment?.house_id ?? "")?.colorHex ?? null,
      assignmentSource: assignment?.assignment_source ?? null,
      isLocked: assignment?.is_locked ?? false,
      assignedAt: assignment?.assigned_at ?? null,
      ageOnReferenceDate: roster?.age_on_reference_date ?? null,
      ageGroupLabel: roster?.age_group_label ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

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
