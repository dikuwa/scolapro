import { createSupabaseServerClient } from "@/lib/supabase/server";

type ReviewRole = "school_admin" | "principal" | "deputy_principal" | "hod";

type SubmissionRow = {
  id: string;
  tenant_id: string;
  school_id: string;
  academic_year: number;
  submitted_by_user_id: string;
  scope_kind: string;
  term_label: string | null;
  week_start: string | null;
  week_end: string | null;
  status: string;
  submitted_at: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

type SubmissionItemRow = {
  id: string;
  preparation_submission_id: string;
  lesson_preparation_id: string;
  preparation_status_snapshot: string;
};

type PreparationRow = {
  id: string;
  teaching_schedule_item_id: string;
  planned_on: string;
  status: string;
  curriculum_snapshot: Record<string, unknown> | null;
};

type ReviewEventRow = {
  id: string;
  preparation_submission_id: string;
  event_kind: string;
  actor_user_id: string;
  actor_role_snapshot: string;
  comment: string | null;
  occurred_at: string;
};

type ReadinessRpcRow = {
  exception_kind: string;
  subject_offering_id: string | null;
  subject_id: string | null;
  register_class_id: string | null;
  teacher_allocation_id: string | null;
  detail: string;
  severity: string;
};

export type ReviewPreparationItem = {
  id: string;
  lessonPreparationId: string;
  plannedOn: string;
  preparationStatus: string;
  subjectName: string;
  gradeName: string;
  className: string;
  topic: string | null;
  theme: string | null;
};

export type ReviewHistoryEvent = {
  id: string;
  kind: string;
  actorName: string;
  actorRole: string;
  comment: string | null;
  occurredAt: string;
};

export type ReviewSubmission = {
  id: string;
  academicYear: number;
  teacherName: string;
  scopeKind: string;
  termLabel: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
  feedback: string | null;
  subjects: string[];
  grades: string[];
  classes: string[];
  items: ReviewPreparationItem[];
  history: ReviewHistoryEvent[];
};

export type TeachingReadinessException = {
  kind: string;
  detail: string;
  severity: string;
  subjectOfferingId: string | null;
  subjectId: string | null;
  classId: string | null;
  teacherAllocationId: string | null;
};

export type ReviewWorkspaceData = {
  submissions: ReviewSubmission[];
  readiness: TeachingReadinessException[];
};

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function snapshotText(snapshot: Record<string, unknown> | null, key: string): string | null {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

async function actorNames(schoolId: string, userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!userIds.length) return names;
  const supabase = await createSupabaseServerClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("school_memberships")
    .select("user_id,staff_member_id")
    .eq("school_id", schoolId)
    .in("user_id", unique(userIds));
  if (membershipError) throw new Error("Unable to resolve review participants.");

  const staffIds = unique((memberships ?? []).map((row) => row.staff_member_id).filter((id): id is string => Boolean(id)));
  const { data: staff, error: staffError } = staffIds.length
    ? await supabase.from("staff_members").select("id,first_name,last_name").in("id", staffIds)
    : { data: [], error: null };
  if (staffError) throw new Error("Unable to resolve review participants.");
  const staffNames = new Map((staff ?? []).map((row) => [row.id, `${row.first_name} ${row.last_name}`.trim()]));
  for (const membership of memberships ?? []) {
    if (membership.staff_member_id) names.set(membership.user_id, staffNames.get(membership.staff_member_id) ?? "Staff member");
  }
  return names;
}

async function hydrateSubmissions(schoolId: string, rows: SubmissionRow[], includeHistory: boolean): Promise<ReviewSubmission[]> {
  if (!rows.length) return [];
  const supabase = await createSupabaseServerClient();
  const submissionIds = rows.map((row) => row.id);

  const { data: itemData, error: itemError } = await supabase
    .from("preparation_submission_items")
    .select("id,preparation_submission_id,lesson_preparation_id,preparation_status_snapshot")
    .in("preparation_submission_id", submissionIds);
  if (itemError) throw new Error("Unable to load preparation submission items.");
  const items = (itemData ?? []) as SubmissionItemRow[];
  const preparationIds = unique(items.map((item) => item.lesson_preparation_id));

  const { data: preparationData, error: preparationError } = preparationIds.length
    ? await supabase
        .from("lesson_preparations")
        .select("id,teaching_schedule_item_id,planned_on,status,curriculum_snapshot")
        .in("id", preparationIds)
    : { data: [], error: null };
  if (preparationError) throw new Error("Unable to load submitted preparations.");
  const preparations = (preparationData ?? []) as PreparationRow[];
  const preparationById = new Map(preparations.map((row) => [row.id, row]));
  const scheduleIds = unique(preparations.map((row) => row.teaching_schedule_item_id));

  const { data: scheduleData, error: scheduleError } = scheduleIds.length
    ? await supabase
        .from("teaching_schedule_items")
        .select("id,teacher_allocation_id,register_class_id")
        .in("id", scheduleIds)
    : { data: [], error: null };
  if (scheduleError) throw new Error("Unable to load teaching schedule context.");
  const scheduleById = new Map((scheduleData ?? []).map((row) => [row.id, row]));
  const allocationIds = unique((scheduleData ?? []).map((row) => row.teacher_allocation_id));

  const { data: allocationData, error: allocationError } = allocationIds.length
    ? await supabase
        .from("teacher_allocations")
        .select("id,subject_offerings(subjects(display_name),grades(display_name)),register_classes(display_name)")
        .in("id", allocationIds)
    : { data: [], error: null };
  if (allocationError) throw new Error("Unable to load submitted teaching context.");
  const allocationById = new Map((allocationData ?? []).map((row) => [row.id, row]));

  const eventResult = includeHistory
    ? await supabase
        .from("preparation_review_events")
        .select("id,preparation_submission_id,event_kind,actor_user_id,actor_role_snapshot,comment,occurred_at")
        .in("preparation_submission_id", submissionIds)
        .order("occurred_at", { ascending: true })
    : { data: [], error: null };
  if (eventResult.error) throw new Error("Unable to load review history.");
  const events = (eventResult.data ?? []) as ReviewEventRow[];

  const participantIds = unique([
    ...rows.map((row) => row.submitted_by_user_id),
    ...rows.map((row) => row.reviewed_by_user_id).filter((id): id is string => Boolean(id)),
    ...events.map((event) => event.actor_user_id),
  ]);
  const names = await actorNames(schoolId, participantIds);

  return rows.map((submission) => {
    const submissionItems = items.filter((item) => item.preparation_submission_id === submission.id).map((item) => {
      const preparation = preparationById.get(item.lesson_preparation_id);
      const schedule = preparation ? scheduleById.get(preparation.teaching_schedule_item_id) : null;
      const allocation = schedule ? allocationById.get(schedule.teacher_allocation_id) : null;
      const offering = allocation ? one(allocation.subject_offerings) : null;
      const subject = offering ? one(offering.subjects) : null;
      const grade = offering ? one(offering.grades) : null;
      const registerClass = allocation ? one(allocation.register_classes) : null;
      return {
        id: item.id,
        lessonPreparationId: item.lesson_preparation_id,
        plannedOn: preparation?.planned_on ?? "",
        preparationStatus: item.preparation_status_snapshot,
        subjectName: subject?.display_name ?? "Subject",
        gradeName: grade?.display_name ?? "Grade",
        className: registerClass?.display_name ?? "Class",
        topic: snapshotText(preparation?.curriculum_snapshot ?? null, "topic"),
        theme: snapshotText(preparation?.curriculum_snapshot ?? null, "theme"),
      } satisfies ReviewPreparationItem;
    });
    const history = events
      .filter((event) => event.preparation_submission_id === submission.id)
      .map((event) => ({
        id: event.id,
        kind: event.event_kind,
        actorName: names.get(event.actor_user_id) ?? "Staff member",
        actorRole: event.actor_role_snapshot,
        comment: event.comment,
        occurredAt: event.occurred_at,
      }));
    return {
      id: submission.id,
      academicYear: submission.academic_year,
      teacherName: names.get(submission.submitted_by_user_id) ?? "Teacher",
      scopeKind: submission.scope_kind,
      termLabel: submission.term_label,
      weekStart: submission.week_start,
      weekEnd: submission.week_end,
      status: submission.status,
      submittedAt: submission.submitted_at,
      reviewedAt: submission.reviewed_at,
      reviewerName: submission.reviewed_by_user_id ? names.get(submission.reviewed_by_user_id) ?? "Staff member" : null,
      feedback: submission.review_note,
      subjects: unique(submissionItems.map((item) => item.subjectName)),
      grades: unique(submissionItems.map((item) => item.gradeName)),
      classes: unique(submissionItems.map((item) => item.className)),
      items: submissionItems,
      history,
    };
  });
}

async function getReadiness(schoolId: string, academicYear: number): Promise<TeachingReadinessException[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_hod_teaching_readiness", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
  });
  if (error) throw new Error("Unable to load teaching readiness.");
  return ((data ?? []) as ReadinessRpcRow[]).map((row) => ({
    kind: row.exception_kind,
    detail: row.detail,
    severity: row.severity,
    subjectOfferingId: row.subject_offering_id,
    subjectId: row.subject_id,
    classId: row.register_class_id,
    teacherAllocationId: row.teacher_allocation_id,
  }));
}

export async function getReviewWorkspace(input: {
  schoolId: string;
  academicYear: number;
  roleKey: ReviewRole;
}): Promise<ReviewWorkspaceData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("preparation_submissions")
    .select("id,tenant_id,school_id,academic_year,submitted_by_user_id,scope_kind,term_label,week_start,week_end,status,submitted_at,reviewed_by_user_id,reviewed_at,review_note")
    .eq("school_id", input.schoolId)
    .eq("academic_year", input.academicYear)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error("Unable to load preparation review queue.");

  // RLS delegates reviewer visibility to can_review_preparation_submission(),
  // so HOD rows are subject-responsibility scoped and leadership remains
  // school-wide only where the merged DB contract permits it.
  const submissions = await hydrateSubmissions(input.schoolId, (data ?? []) as SubmissionRow[], false);
  const readiness = await getReadiness(input.schoolId, input.academicYear);
  return { submissions, readiness };
}

export async function getReviewSubmission(input: {
  schoolId: string;
  submissionId: string;
}): Promise<ReviewSubmission | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("preparation_submissions")
    .select("id,tenant_id,school_id,academic_year,submitted_by_user_id,scope_kind,term_label,week_start,week_end,status,submitted_at,reviewed_by_user_id,reviewed_at,review_note")
    .eq("school_id", input.schoolId)
    .eq("id", input.submissionId)
    .maybeSingle();
  if (error) throw new Error("Unable to load preparation review.");
  if (!data) return null;
  const [submission] = await hydrateSubmissions(input.schoolId, [data as SubmissionRow], true);
  return submission ?? null;
}
