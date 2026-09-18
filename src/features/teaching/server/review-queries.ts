"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user-context";
import { formatPersonName } from "@/lib/person-name";

/**
 * Governed HOD preparation-review read layer.
 *
 * Reads use the normal authenticated Supabase SELECT surface and let the merged
 * RLS policies decide visibility (the submission read policy plus the scoped
 * child policies). There is no client-visible private helper call, no service
 * role, no admin client and no duplicated copy of the DB read predicate.
 */

export type ReviewScope = {
  membershipId: string;
  schoolId: string;
  roleKey: string;
  staffMemberId: string | null;
};

export type ReviewQueueRow = {
  id: string;
  scopeKind: string;
  scopeLabel: string;
  status: string;
  submittedAt: string;
  submittedOn: string | null;
  teacherName: string | null;
  subjectLabel: string | null;
  gradeLabel: string | null;
  classLabel: string | null;
  itemCount: number;
};

export type ReadinessException = {
  exceptionKind: string;
  subjectOfferingId: string | null;
  subjectId: string | null;
  registerClassId: string | null;
  teacherAllocationId: string | null;
  detail: string;
  severity: string;
};

/**
 * Readiness is either a genuine governed result, an explicit authority denial,
 * or an unavailable/error state. An error is never collapsed into "no
 * exceptions" because an empty operational view and an unauthorized view must
 * not look identical to a reviewer.
 */
export type ReadinessState =
  | { state: "ok"; exceptions: ReadinessException[] }
  | { state: "denied"; message: string }
  | { state: "unavailable"; message: string };

export type ReviewQueueResult = {
  rows: ReviewQueueRow[];
  readiness: ReadinessState;
};

export type CurriculumContext = {
  version: string | null;
  theme: string | null;
  topic: string | null;
  objectives: string[];
  competencies: string[];
};

export type ReviewSubmissionItem = {
  lessonPreparationId: string;
  preparationStatusSnapshot: string;
  subjectLabel: string | null;
  gradeLabel: string | null;
  registerClassLabel: string | null;
  teacherName: string | null;
  lessonStatus: string | null;
  plannedOn: string | null;
  plannedOnLabel: string | null;
  plannedPeriodCount: number | null;
  preparation: Record<string, string>;
  curriculum: CurriculumContext | null;
};

export type ReviewEvent = {
  id: string;
  eventKind: string;
  actorRoleSnapshot: string;
  comment: string | null;
  occurredAt: string;
  occurredAtLabel: string | null;
};

export type ReviewDetail = {
  submission: {
    id: string;
    scopeKind: string;
    scopeLabel: string;
    status: string;
    academicYear: number;
    submittedAt: string;
    submittedOn: string | null;
    submittedAtLabel: string | null;
    reviewedAtLabel: string | null;
    reviewNote: string | null;
    itemCount: number;
  };
  items: ReviewSubmissionItem[];
  events: ReviewEvent[];
};

const reviewerRoleOrder = ["school_admin", "principal", "deputy_principal", "hod"] as const;
const academicYearSchema = z.coerce.number().int().min(2000).max(2200);
const submissionIdSchema = z.string().uuid();

const dateLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Windhoek",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateTimeLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Windhoek",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : dateLabelFormatter.format(parsed);
}

function dateTimeLabel(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : dateTimeLabelFormatter.format(parsed);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function staffName(row: StaffNameRow): string | null {
  if (!row) return null;
  return formatPersonName(`${row.first_name ?? ""} ${row.last_name ?? ""}`) || null;
}

function summarize(values: Array<string | null>): string | null {
  const unique = [...new Set(values.filter((value): value is string => Boolean(value)))];
  if (!unique.length) return null;
  if (unique.length === 1) return unique[0];
  return `${unique[0]} +${unique.length - 1} more`;
}

function scopeLabel(row: { scope_kind: string; term_label: string | null; week_start: string | null; week_end: string | null }): string {
  if (row.scope_kind === "week") {
    const start = dateLabel(row.week_start);
    const end = dateLabel(row.week_end);
    if (start && end) return `${start} – ${end}`;
    return "One week";
  }
  if (row.scope_kind === "term") return row.term_label ? `Term: ${row.term_label}` : "Whole term";
  return "Selected preparations";
}

/**
 * Deterministic current-school reviewer scope.
 *
 * getUserContext is the repository current-school convention: `memberships` is
 * already bounded to the single deterministic current school (the newest
 * effective membership) while the all-school membership list retains other
 * schools for identity only. This resolver deliberately never reads that list,
 * so another active non-current school can never become review scope.
 *
 * The reviewer role is resolved through an explicit preference order, so a user
 * with several memberships at the current school always resolves the same
 * scope. Effective membership dates, effective staff placement, HOD subject
 * responsibility and school/tenant isolation stay DB-enforced (RLS + the
 * governed RPCs), so an ended/stale placement cannot retain review authority
 * even though this resolver only routes the workspace.
 *
 * Platform Support is excluded explicitly and is never treated as Platform
 * Admin. The DB keeps that distinction: the platform administrative role
 * retains DB-governed cross-school supervision while Platform Support has no
 * operational school-review authority. The operational review workspace itself
 * is current-school scoped, so it always requires a current-school reviewer
 * membership.
 */
export async function resolveReviewScope(): Promise<ReviewScope | null> {
  const context = await getUserContext();
  if (!context.user) return null;
  if (context.platformMemberships.some((membership) => membership.roleKey === "platform_support")) return null;

  const membership = reviewerRoleOrder
    .map((roleKey) => context.memberships.find((candidate) => candidate.roleKey === roleKey))
    .find((candidate) => candidate !== undefined);
  if (!membership) return null;

  return {
    membershipId: membership.membershipId,
    schoolId: membership.schoolId,
    roleKey: membership.roleKey,
    staffMemberId: membership.staffMemberId,
  };
}

const readinessRowSchema = z.object({
  exception_kind: z.string(),
  subject_offering_id: z.string().nullable(),
  subject_id: z.string().nullable(),
  register_class_id: z.string().nullable(),
  teacher_allocation_id: z.string().nullable(),
  detail: z.string(),
  severity: z.string(),
});

async function getReadinessState(scope: ReviewScope, academicYear: number): Promise<ReadinessState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_hod_teaching_readiness", {
    p_school_id: scope.schoolId,
    p_academic_year: academicYear,
  });

  if (error) {
    // Authority denials and transport/query failures must stay distinguishable
    // from a genuine "no exceptions" result.
    const denied = /permission denied/i.test(error.message ?? "");
    return denied
      ? { state: "denied", message: "Readiness exceptions are not available for your current review authority." }
      : { state: "unavailable", message: "Readiness exceptions could not be loaded." };
  }

  const parsed = z.array(readinessRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    return { state: "unavailable", message: "Readiness exceptions returned an unexpected shape." };
  }

  return {
    state: "ok",
    exceptions: parsed.data.map((row) => ({
      exceptionKind: row.exception_kind,
      subjectOfferingId: row.subject_offering_id,
      subjectId: row.subject_id,
      registerClassId: row.register_class_id,
      teacherAllocationId: row.teacher_allocation_id,
      detail: row.detail,
      severity: row.severity,
    })),
  };
}

type NamedRow = { display_name: string | null } | null;
type StaffNameRow = { first_name: string | null; last_name: string | null } | null;

/**
 * Embedded shapes for the merged teaching/curriculum relations. The selected
 * children are exactly the FK paths that exist in the merged schema
 * (preparation_submissions -> preparation_submission_items ->
 * lesson_preparations -> teaching_schedule_items -> register_classes /
 * teacher_allocations -> staff_members + subject_offerings -> subjects/grades).
 */
type ReviewLessonRow = {
  id: string;
  status: string | null;
  planned_on: string | null;
  teaching_schedule_item: {
    id: string;
    planned_on: string | null;
    planned_period_count: number | null;
    status: string | null;
    register_class: NamedRow;
    teacher_allocation: {
      id: string;
      teacher: StaffNameRow;
      subject_offering: {
        id: string;
        grade: NamedRow;
        subject: NamedRow;
      } | null;
    } | null;
  } | null;
};

type ReviewItemRow = {
  id: string;
  lesson_preparation_id: string;
  preparation_status_snapshot: string;
  lesson_preparation: ReviewLessonRow | null;
};

/** The detail read additionally carries the teacher content and curriculum snapshot. */
type ReviewDetailItemRow = Omit<ReviewItemRow, "lesson_preparation"> & {
  lesson_preparation: (ReviewLessonRow & {
    preparation: Record<string, unknown> | null;
    curriculum_snapshot: Record<string, unknown> | null;
  }) | null;
};

type ReviewSubmissionRow = {
  id: string;
  scope_kind: string;
  term_label: string | null;
  week_start: string | null;
  week_end: string | null;
  status: string;
  submitted_at: string;
  academic_year: number;
  items: ReviewItemRow[] | null;
};

type ReviewDetailRow = Omit<ReviewSubmissionRow, "items"> & {
  items: ReviewDetailItemRow[] | null;
  reviewed_at: string | null;
  review_note: string | null;
  events: ReviewEventRow[] | null;
};

type ReviewEventRow = {
  id: string;
  event_kind: string;
  actor_role_snapshot: string;
  comment: string | null;
  occurred_at: string;
};

const reviewQueueSelect = `
  id, scope_kind, term_label, week_start, week_end, status, submitted_at, academic_year,
  items:preparation_submission_items(
    id, lesson_preparation_id, preparation_status_snapshot,
    lesson_preparation:lesson_preparations(
      id, status, planned_on,
      teaching_schedule_item:teaching_schedule_items(
        id, planned_on, planned_period_count, status,
        register_class:register_classes(display_name),
        teacher_allocation:teacher_allocations(
          id,
          teacher:staff_members(first_name, last_name),
          subject_offering:subject_offerings(
            id,
            grade:grades(display_name),
            subject:subjects(display_name)
          )
        )
      )
    )
  )
`;

function toQueueRow(row: ReviewSubmissionRow): ReviewQueueRow {
  const items = row.items ?? [];
  return {
    id: row.id,
    scopeKind: row.scope_kind,
    scopeLabel: scopeLabel(row),
    status: row.status,
    submittedAt: row.submitted_at,
    submittedOn: dateLabel(row.submitted_at),
    teacherName: summarize(items.map((item) => staffName(item.lesson_preparation?.teaching_schedule_item?.teacher_allocation?.teacher ?? null))),
    subjectLabel: summarize(items.map((item) => stringValue(item.lesson_preparation?.teaching_schedule_item?.teacher_allocation?.subject_offering?.subject?.display_name))),
    gradeLabel: summarize(items.map((item) => stringValue(item.lesson_preparation?.teaching_schedule_item?.teacher_allocation?.subject_offering?.grade?.display_name))),
    classLabel: summarize(items.map((item) => stringValue(item.lesson_preparation?.teaching_schedule_item?.register_class?.display_name))),
    itemCount: items.length,
  };
}

/**
 * Queue of preparation submissions awaiting review for the current school.
 * Visibility (HOD subject responsibility, leadership school-wide scope, current
 * school and effective placement, Platform Support exclusion) is decided by the
 * merged RLS policy, not by this query.
 */
export async function getReviewQueue(academicYear: number): Promise<ReviewQueueResult> {
  const scope = await resolveReviewScope();
  if (!scope) {
    return { rows: [], readiness: { state: "denied", message: "You do not have a current review scope at this school." } };
  }
  const parsedYear = academicYearSchema.safeParse(academicYear);
  if (!parsedYear.success) {
    return { rows: [], readiness: { state: "unavailable", message: "The requested academic year is invalid." } };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("preparation_submissions")
    .select(reviewQueueSelect)
    .eq("school_id", scope.schoolId)
    .eq("academic_year", parsedYear.data)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  if (error) {
    return { rows: [], readiness: { state: "unavailable", message: "The preparation review queue could not be loaded." } };
  }

  const rows = ((data ?? []) as unknown as ReviewSubmissionRow[]).map(toQueueRow);
  const readiness = await getReadinessState(scope, parsedYear.data);
  return { rows, readiness };
}

function preparationContent(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const content: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = stringValue(raw);
    if (text) content[key] = text;
  }
  return content;
}

/**
 * Official curriculum context that is already connected to the preparation.
 * The teaching workspace captures this from the connected pacing plan and
 * curriculum registry when the preparation is saved, so nothing is inferred
 * here and no curriculum value is invented for the reviewer.
 */
function curriculumContext(value: unknown): CurriculumContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const context: CurriculumContext = {
    version: stringValue(snapshot.curriculumVersion) ?? stringValue(snapshot.versionKey),
    theme: stringValue(snapshot.theme),
    topic: stringValue(snapshot.topic),
    objectives: stringList(snapshot.generalObjectives ?? snapshot.objectives),
    competencies: stringList(snapshot.competencies),
  };
  const hasContent = context.version || context.theme || context.topic || context.objectives.length || context.competencies.length;
  return hasContent ? context : null;
}

function toDetailItem(item: ReviewDetailItemRow): ReviewSubmissionItem {
  const lesson = item.lesson_preparation;
  const schedule = lesson?.teaching_schedule_item;
  const allocation = schedule?.teacher_allocation;
  const plannedOn = lesson?.planned_on ?? schedule?.planned_on ?? null;
  return {
    lessonPreparationId: lesson?.id ?? item.lesson_preparation_id,
    preparationStatusSnapshot: item.preparation_status_snapshot,
    subjectLabel: stringValue(allocation?.subject_offering?.subject?.display_name),
    gradeLabel: stringValue(allocation?.subject_offering?.grade?.display_name),
    registerClassLabel: stringValue(schedule?.register_class?.display_name),
    teacherName: staffName(allocation?.teacher ?? null),
    lessonStatus: stringValue(schedule?.status),
    plannedOn,
    plannedOnLabel: dateLabel(plannedOn),
    plannedPeriodCount: typeof schedule?.planned_period_count === "number" ? schedule.planned_period_count : null,
    preparation: preparationContent(lesson?.preparation),
    curriculum: curriculumContext(lesson?.curriculum_snapshot),
  };
}

function toReviewEvent(row: ReviewEventRow): ReviewEvent {
  return {
    id: row.id,
    eventKind: row.event_kind,
    actorRoleSnapshot: row.actor_role_snapshot,
    comment: row.comment,
    occurredAt: row.occurred_at,
    occurredAtLabel: dateTimeLabel(row.occurred_at),
  };
}

/**
 * Reviewer read model for one submission.
 *
 * Returns null when no row is visible through the authenticated RLS surface (or
 * when the id is not a submission id), so the route can answer with the
 * repository's not-found convention instead of leaking another school's
 * submission. Teacher-authored preparation content and the connected official
 * curriculum snapshot are returned read-only; review events are returned in
 * historical order for an append-only history view.
 */
export async function getReviewDetail(submissionId: string): Promise<ReviewDetail | null> {
  const scope = await resolveReviewScope();
  if (!scope) return null;

  const parsedId = submissionIdSchema.safeParse(submissionId);
  if (!parsedId.success) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("preparation_submissions")
    .select(`
      id, scope_kind, term_label, week_start, week_end, status, submitted_at, academic_year,
      reviewed_at, review_note,
      items:preparation_submission_items(
        id, lesson_preparation_id, preparation_status_snapshot,
        lesson_preparation:lesson_preparations(
          id, status, planned_on, preparation, curriculum_snapshot,
          teaching_schedule_item:teaching_schedule_items(
            id, planned_on, planned_period_count, status,
            register_class:register_classes(display_name),
            teacher_allocation:teacher_allocations(
              id,
              teacher:staff_members(first_name, last_name),
              subject_offering:subject_offerings(
                id,
                grade:grades(display_name),
                subject:subjects(display_name)
              )
            )
          )
        )
      ),
      events:preparation_review_events(
        id, event_kind, actor_role_snapshot, comment, occurred_at
      )
    `)
    .eq("id", parsedId.data)
    .eq("school_id", scope.schoolId)
    .maybeSingle();

  if (error || !data) return null;

  const submission = data as unknown as ReviewDetailRow;
  const items = (submission.items ?? []).map(toDetailItem);
  const events = (submission.events ?? [])
    .map(toReviewEvent)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  return {
    submission: {
      id: submission.id,
      scopeKind: submission.scope_kind,
      scopeLabel: scopeLabel(submission),
      status: submission.status,
      academicYear: submission.academic_year,
      submittedAt: submission.submitted_at,
      submittedOn: dateLabel(submission.submitted_at),
      submittedAtLabel: dateTimeLabel(submission.submitted_at),
      reviewedAtLabel: dateTimeLabel(submission.reviewed_at),
      reviewNote: submission.review_note,
      itemCount: items.length,
    },
    items,
    events,
  };
}