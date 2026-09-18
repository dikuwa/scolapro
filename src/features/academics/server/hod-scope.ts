import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type HodScopeSubject = {
  id: string;
  code: string;
  name: string;
};

export type HodScopeHeadOption = {
  assignmentId: string;
  staffMemberId: string;
  name: string;
};

export type HodScopeResponsibility = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  assignmentId: string;
  headName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

function windhoekToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function activeOn(date: string, from: string, to: string | null) {
  return from <= date && (!to || to >= date);
}

export async function getHodScopeConfiguration(schoolId: string) {
  const db = await createSupabaseServerClient();
  const today = windhoekToday();

  const [subjectsResult, responsibilitiesResult, assignmentsResult, membershipsResult] = await Promise.all([
    db
      .from("subjects")
      .select("id,subject_code,display_name")
      .eq("school_id", schoolId)
      .order("display_name"),
    db
      .from("subject_department_responsibilities")
      .select("id,subject_id,department_head_staff_assignment_id,effective_from,effective_to")
      .eq("school_id", schoolId)
      .order("effective_from", { ascending: false }),
    db
      .from("staff_school_assignments")
      .select("id,staff_member_id,effective_from,effective_to")
      .eq("school_id", schoolId),
    db
      .from("school_memberships")
      .select("staff_member_id,role_key,active_from,active_to")
      .eq("school_id", schoolId)
      .eq("role_key", "hod"),
  ]);

  if (
    subjectsResult.error ||
    responsibilitiesResult.error ||
    assignmentsResult.error ||
    membershipsResult.error
  ) {
    throw new Error("Unable to load HOD responsibility configuration.");
  }

  const assignments = assignmentsResult.data ?? [];
  const memberships = membershipsResult.data ?? [];
  const staffIds = Array.from(
    new Set(assignments.map((row) => row.staff_member_id).filter(Boolean)),
  ) as string[];

  const staffResult = staffIds.length
    ? await db
        .from("staff_members")
        .select("id,first_name,last_name,status")
        .in("id", staffIds)
    : { data: [], error: null };

  if (staffResult.error) throw new Error("Unable to load HOD staff identities.");

  const staffById = new Map(
    (staffResult.data ?? []).map((staff) => [
      staff.id,
      {
        name: `${staff.first_name} ${staff.last_name}`.trim(),
        status: staff.status,
      },
    ]),
  );
  const subjectById = new Map(
    (subjectsResult.data ?? []).map((subject) => [subject.id, subject]),
  );

  const currentHodStaff = new Set(
    memberships
      .filter(
        (membership) =>
          membership.staff_member_id &&
          activeOn(today, membership.active_from, membership.active_to),
      )
      .map((membership) => membership.staff_member_id as string),
  );

  const heads: HodScopeHeadOption[] = assignments
    .filter((assignment) => {
      const staff = staffById.get(assignment.staff_member_id);
      return (
        Boolean(staff) &&
        staff?.status === "active" &&
        currentHodStaff.has(assignment.staff_member_id) &&
        activeOn(today, assignment.effective_from, assignment.effective_to)
      );
    })
    .map((assignment) => ({
      assignmentId: assignment.id,
      staffMemberId: assignment.staff_member_id,
      name: staffById.get(assignment.staff_member_id)?.name ?? "HOD",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const responsibilities: HodScopeResponsibility[] = (responsibilitiesResult.data ?? []).map(
    (row) => {
      const subject = subjectById.get(row.subject_id);
      const assignment = assignments.find(
        (item) => item.id === row.department_head_staff_assignment_id,
      );
      return {
        id: row.id,
        subjectId: row.subject_id,
        subjectName: subject?.display_name ?? "Unknown subject",
        subjectCode: subject?.subject_code ?? "",
        assignmentId: row.department_head_staff_assignment_id,
        headName: assignment
          ? staffById.get(assignment.staff_member_id)?.name ?? "Historical HOD"
          : "Historical HOD",
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
      };
    },
  );

  const subjects: HodScopeSubject[] = (subjectsResult.data ?? []).map((subject) => ({
    id: subject.id,
    code: subject.subject_code,
    name: subject.display_name,
  }));

  return { subjects, heads, responsibilities, today };
}
