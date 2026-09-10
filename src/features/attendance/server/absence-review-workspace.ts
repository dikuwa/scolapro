import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AbsenceReviewRoleContext = {
  roleKey: string;
  staffMemberId: string | null;
};

type ScopeRow = {
  scope_kind: "daily_class" | "subject_slot";
  scope_id: string;
  register_class_id: string;
};

type GuardianNoticeRow = {
  id: string;
  learner_id: string;
  absence_from: string;
  absence_to: string;
  reason_category: string | null;
  message: string | null;
  status: string;
  review_note: string | null;
  guardian_absence_notice_attachments: { id: string }[] | null;
};

export type AbsenceReviewNotice = {
  id: string;
  absenceFrom: string;
  absenceTo: string;
  reason: string;
  message: string | null;
  status: string;
  reviewNote: string | null;
  attachmentCount: number;
};

export type DailyAbsenceReviewRow = {
  key: string;
  learnerId: string;
  learnerName: string;
  date: string;
  gradeId: string | null;
  gradeName: string;
  classId: string;
  className: string;
  status: string;
  reason: string | null;
  note: string | null;
  evidenceState: "available" | "none" | "restricted";
  explanation: AbsenceReviewNotice | null;
};

export type SubjectPeriodAbsenceReviewRow = Omit<DailyAbsenceReviewRow, "evidenceState"> & {
  timetableSlotId: string;
  subjectOfferingId: string | null;
  subjectName: string;
  periodName: string;
  teacherName: string;
  recordedBy: string | null;
  dailyStatus: string | null;
};

export type AbsenceReviewFilters = {
  from: string;
  to: string;
  learnerId?: string;
  gradeId?: string;
  classId?: string;
  subjectOfferingId?: string;
  reviewState?: string;
};

export type AbsenceReviewWorkspace = {
  daily: DailyAbsenceReviewRow[];
  subjectPeriod: SubjectPeriodAbsenceReviewRow[];
  classes: { id: string; name: string; gradeId: string | null; gradeName: string }[];
  learners: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  canReviewNotices: boolean;
  summary: {
    dailyAbsences: number;
    unexplainedDailyAbsences: number;
    awaitingReview: number;
    subjectPeriodAbsences: number;
  };
};

const reviewRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher", "counsellor"]);
const schoolWideEvidenceRoles = new Set(["school_admin", "principal", "deputy_principal", "counsellor"]);
const absenceStatuses = ["absent", "excused"];

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function guardianReasonLabel(value: string | null) {
  const labels: Record<string, string> = {
    illness: "Illness",
    medical_appointment: "Medical appointment",
    compassionate: "Compassionate",
    family: "Family",
    transport: "Transport",
    weather: "Weather",
    school_activity: "School activity",
    other: "Other",
  };
  return value ? (labels[value] ?? value) : "Explanation submitted";
}

export async function getAbsenceReviewWorkspace(
  schoolId: string,
  role: AbsenceReviewRoleContext,
  filters: AbsenceReviewFilters,
): Promise<AbsenceReviewWorkspace> {
  const supabase = await createSupabaseServerClient();
  const canReviewNotices = reviewRoles.has(role.roleKey);

  const { data: scopeData, error: scopeError } = await supabase.rpc("resolve_absence_review_scope", {
    p_school_id: schoolId,
    p_from: filters.from,
    p_to: filters.to,
  });
  if (scopeError) throw new Error("Unable to resolve absenteeism access scope.");

  const scope = (scopeData ?? []) as ScopeRow[];
  const authorizedDailyClasses = new Set(scope.filter((item) => item.scope_kind === "daily_class").map((item) => item.scope_id));
  const authorizedSubjectSlots = new Set(scope.filter((item) => item.scope_kind === "subject_slot").map((item) => item.scope_id));
  const visibleClassIds = new Set(scope.map((item) => item.register_class_id));

  const { data: classes, error: classError } = await supabase
    .from("register_classes")
    .select("id,display_name,grade_id,register_teacher_staff_id,grades(display_name)")
    .eq("school_id", schoolId)
    .order("display_name");
  if (classError) throw new Error("Unable to load absence review classes.");

  const allClassRows = (classes ?? []).map((item) => ({
    id: item.id,
    name: item.display_name,
    gradeId: item.grade_id,
    gradeName: one(item.grades)?.display_name ?? "Grade",
    registerTeacherStaffId: item.register_teacher_staff_id,
  }));
  const classRows = allClassRows.filter((item) => visibleClassIds.has(item.id));
  const assignedRegisterClasses = new Set(
    allClassRows
      .filter((item) => role.roleKey === "class_teacher" && role.staffMemberId && item.registerTeacherStaffId === role.staffMemberId && authorizedDailyClasses.has(item.id))
      .map((item) => item.id),
  );

  const { data: reasons, error: reasonError } = await supabase
    .from("attendance_reasons")
    .select("id,display_name")
    .eq("audience", "learner")
    .eq("active", true);
  if (reasonError) throw new Error("Unable to load absenteeism reasons.");

  let dailyRows: Array<{
    enrolment_id: string; learner_id: string; register_class_id: string; attendance_date: string;
    status: string; reason_id: string | null; note: string | null; first_names: string | null; surname: string | null;
  }> = [];
  if (authorizedDailyClasses.size) {
    const { data, error } = await supabase.from("daily_register_current")
      .select("enrolment_id,learner_id,register_class_id,attendance_date,status,reason_id,note,first_names,surname")
      .eq("school_id", schoolId)
      .gte("attendance_date", filters.from)
      .lte("attendance_date", filters.to)
      .in("status", absenceStatuses)
      .in("register_class_id", [...authorizedDailyClasses]);
    if (error) throw new Error("Unable to load daily absenteeism records.");
    dailyRows = data ?? [];
  }

  let subjectRows: Array<{
    enrolment_id: string; learner_id: string; register_class_id: string; timetable_slot_id: string; attendance_date: string;
    status: string; reason_id: string | null; note: string | null; first_names: string | null; surname: string | null;
    recorded_by_user_id: string | null;
  }> = [];
  if (authorizedSubjectSlots.size) {
    const { data, error } = await supabase.from("subject_attendance_current")
      .select("enrolment_id,learner_id,register_class_id,timetable_slot_id,attendance_date,status,reason_id,note,first_names,surname,recorded_by_user_id")
      .eq("school_id", schoolId)
      .gte("attendance_date", filters.from)
      .lte("attendance_date", filters.to)
      .in("status", absenceStatuses)
      .in("timetable_slot_id", [...authorizedSubjectSlots]);
    if (error) throw new Error("Unable to load subject-period absenteeism records.");
    subjectRows = data ?? [];
  }

  const learnerIds = [...new Set([...dailyRows, ...subjectRows].map((row) => row.learner_id))];
  let notices: GuardianNoticeRow[] = [];
  if (canReviewNotices || learnerIds.length) {
    let noticeQuery = supabase.from("guardian_absence_notices")
      .select("id,learner_id,absence_from,absence_to,reason_category,message,status,review_note,guardian_absence_notice_attachments(id)")
      .eq("school_id", schoolId)
      .lte("absence_from", filters.to)
      .gte("absence_to", filters.from);
    if (!canReviewNotices) noticeQuery = noticeQuery.in("learner_id", learnerIds);
    const { data, error } = await noticeQuery;
    if (error) throw new Error("Unable to load guardian absence explanations.");
    notices = (data ?? []) as GuardianNoticeRow[];
  }

  const evidenceByEnrolmentDate = new Set<string>();
  if (dailyRows.length) {
    const { data: evidence, error: evidenceError } = await supabase
      .from("attendance_evidence")
      .select("enrolment_id,attendance_date")
      .eq("school_id", schoolId)
      .gte("attendance_date", filters.from)
      .lte("attendance_date", filters.to);
    if (evidenceError) throw new Error("Unable to load attendance evidence state.");
    for (const item of evidence ?? []) evidenceByEnrolmentDate.add(`${item.enrolment_id}:${item.attendance_date}`);
  }

  const reasonNames = new Map((reasons ?? []).map((item) => [item.id, item.display_name]));
  const classById = new Map(allClassRows.map((item) => [item.id, item]));
  const noticeFor = (learnerId: string, date: string): AbsenceReviewNotice | null => {
    const row = notices.find((item) => item.learner_id === learnerId && item.absence_from <= date && item.absence_to >= date);
    if (!row) return null;
    return {
      id: row.id,
      absenceFrom: row.absence_from,
      absenceTo: row.absence_to,
      reason: guardianReasonLabel(row.reason_category),
      message: canReviewNotices ? row.message : null,
      status: row.status,
      reviewNote: canReviewNotices ? row.review_note : null,
      attachmentCount: canReviewNotices ? (row.guardian_absence_notice_attachments?.length ?? 0) : 0,
    };
  };

  let daily: DailyAbsenceReviewRow[] = dailyRows.map((row) => {
    const schoolClass = classById.get(row.register_class_id);
    const evidenceVisible = schoolWideEvidenceRoles.has(role.roleKey) || assignedRegisterClasses.has(row.register_class_id);
    return {
      key: `daily:${row.enrolment_id}:${row.attendance_date}`,
      learnerId: row.learner_id,
      learnerName: `${row.first_names ?? ""} ${row.surname ?? ""}`.trim() || "Learner",
      date: row.attendance_date,
      gradeId: schoolClass?.gradeId ?? null,
      gradeName: schoolClass?.gradeName ?? "Grade",
      classId: row.register_class_id,
      className: schoolClass?.name ?? "Class",
      status: row.status,
      reason: row.reason_id ? (reasonNames.get(row.reason_id) ?? null) : null,
      note: row.note,
      evidenceState: evidenceVisible ? (evidenceByEnrolmentDate.has(`${row.enrolment_id}:${row.attendance_date}`) ? "available" : "none") : "restricted",
      explanation: noticeFor(row.learner_id, row.attendance_date),
    };
  });

  const slotIds = [...new Set(subjectRows.map((row) => row.timetable_slot_id))];
  const slotContext = new Map<string, { subjectOfferingId: string | null; subjectName: string; periodName: string; teacherName: string }>();
  if (slotIds.length) {
    const { data: slots, error: slotError } = await supabase.from("timetable_slots")
      .select("id,timetable_periods(display_name),teacher_allocations(subject_offering_id,staff_members(first_name,last_name),subject_offerings(subjects(display_name)))")
      .eq("school_id", schoolId)
      .in("id", slotIds);
    if (slotError) throw new Error("Unable to load subject-period context.");
    for (const slot of slots ?? []) {
      const allocation = one(slot.teacher_allocations);
      const offering = allocation ? one(allocation.subject_offerings) : null;
      const subject = offering ? one(offering.subjects) : null;
      const staff = allocation ? one(allocation.staff_members) : null;
      slotContext.set(slot.id, {
        subjectOfferingId: allocation?.subject_offering_id ?? null,
        subjectName: subject?.display_name ?? "Subject",
        periodName: one(slot.timetable_periods)?.display_name ?? "Period",
        teacherName: staff ? `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() || "Teacher" : "Teacher",
      });
    }
  }

  const recorderIds = [...new Set(subjectRows.map((row) => row.recorded_by_user_id).filter(Boolean))] as string[];
  const recorderNames = new Map<string, string>();
  if (recorderIds.length) {
    const { data: profiles } = await supabase.from("user_profiles").select("user_id,display_name,preferred_name").in("user_id", recorderIds);
    for (const profile of profiles ?? []) recorderNames.set(profile.user_id, profile.preferred_name || profile.display_name || "Staff member");
  }

  const dailyByLearnerDate = new Map(daily.map((row) => [`${row.learnerId}:${row.date}`, row.status]));
  let subjectPeriod: SubjectPeriodAbsenceReviewRow[] = subjectRows.map((row) => {
    const schoolClass = classById.get(row.register_class_id);
    const slot = slotContext.get(row.timetable_slot_id);
    return {
      key: `subject:${row.enrolment_id}:${row.timetable_slot_id}:${row.attendance_date}`,
      learnerId: row.learner_id,
      learnerName: `${row.first_names ?? ""} ${row.surname ?? ""}`.trim() || "Learner",
      date: row.attendance_date,
      gradeId: schoolClass?.gradeId ?? null,
      gradeName: schoolClass?.gradeName ?? "Grade",
      classId: row.register_class_id,
      className: schoolClass?.name ?? "Class",
      status: row.status,
      reason: row.reason_id ? (reasonNames.get(row.reason_id) ?? null) : null,
      note: row.note,
      explanation: noticeFor(row.learner_id, row.attendance_date),
      timetableSlotId: row.timetable_slot_id,
      subjectOfferingId: slot?.subjectOfferingId ?? null,
      subjectName: slot?.subjectName ?? "Subject",
      periodName: slot?.periodName ?? "Period",
      teacherName: slot?.teacherName ?? "Teacher",
      recordedBy: row.recorded_by_user_id ? (recorderNames.get(row.recorded_by_user_id) ?? null) : null,
      dailyStatus: dailyByLearnerDate.get(`${row.learner_id}:${row.attendance_date}`) ?? null,
    };
  });

  const matchesCommon = (row: Pick<DailyAbsenceReviewRow, "learnerId" | "gradeId" | "classId" | "explanation">) =>
    (!filters.learnerId || row.learnerId === filters.learnerId)
    && (!filters.gradeId || row.gradeId === filters.gradeId)
    && (!filters.classId || row.classId === filters.classId)
    && (!filters.reviewState || filters.reviewState === "all"
      || (filters.reviewState === "unexplained" ? !row.explanation : row.explanation?.status === filters.reviewState));
  daily = daily.filter(matchesCommon);
  subjectPeriod = subjectPeriod.filter((row) => matchesCommon(row) && (!filters.subjectOfferingId || row.subjectOfferingId === filters.subjectOfferingId));

  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  const rowSort = <T extends { date: string; learnerName: string }>(left: T, right: T) => right.date.localeCompare(left.date) || collator.compare(left.learnerName, right.learnerName);
  daily.sort(rowSort);
  subjectPeriod.sort(rowSort);

  const learnerMap = new Map<string, string>();
  for (const row of [...daily, ...subjectPeriod]) learnerMap.set(row.learnerId, row.learnerName);
  const subjectMap = new Map<string, string>();
  for (const row of subjectPeriod) if (row.subjectOfferingId) subjectMap.set(row.subjectOfferingId, row.subjectName);

  const filteredLearnerIds = new Set(daily.map((row) => row.learnerId));
  const awaitingReview = new Set(
    notices
      .filter((notice) => (notice.status === "submitted" || notice.status === "under_review") && (canReviewNotices || filteredLearnerIds.has(notice.learner_id)))
      .map((notice) => notice.id),
  ).size;

  return {
    daily,
    subjectPeriod,
    classes: classRows.map(({ id, name, gradeId, gradeName }) => ({ id, name, gradeId, gradeName })),
    learners: [...learnerMap].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name)),
    subjects: [...subjectMap].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name)),
    canReviewNotices,
    summary: {
      dailyAbsences: daily.length,
      unexplainedDailyAbsences: daily.filter((row) => !row.explanation).length,
      awaitingReview,
      subjectPeriodAbsences: subjectPeriod.length,
    },
  };
}
