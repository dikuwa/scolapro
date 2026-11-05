import { createHash } from "node:crypto";
import type { RegisterTeacherDocument, RegisterTeacherEnrolmentRow } from "@/features/attendance/server/register-teacher-document";

/**
 * Governed full-term register semantics.
 *
 * The full-term sheet is a presentation of the existing term register, not a
 * second attendance engine. This module owns only the rules that are specific
 * to a continuous single-sheet term view:
 *  - the school-local closing/as-of date and its eligible-day boundary;
 *  - fail-closed handling of ambiguous overlapping enrolments;
 *  - the provisional/certified decision.
 *
 * Counting itself stays in `calculateLearnerRegisterBalance`, so weekly,
 * paginated term and full-term output can never disagree about a mark.
 */

export type RegisterTeacherFullTermRequest = {
  /** Server-resolved school-local date. Never trust a browser clock. */
  today: string;
  closingDate?: string | null;
};

export type RegisterTeacherFullTermMetadata = {
  closingDate: string | null;
  today: string;
  /** Official scheduled term days from the governed learner calendar (excludes public holidays / official non-teaching days). */
  scheduledTeachingDayCount: number;
  /** School-included eligible days after applying school closure overrides. */
  includedTeachingDayCount: number;
  /** Full-term possible learner-days: every enrolled learner × every eligible term day (denominator). */
  possibleLearnerDays: number;
  /** Observed learner-days up to the school-local as-of date (actual present + actual absent). */
  observedLearnerDays: number;
  /** Future eligible learner-days counted in the denominator but not yet observed (never certified attendance). */
  projectedLearnerDays: number;
  status: "provisional" | "certified";
  certificationNote: string;
};

export class RegisterTeacherFullTermError extends Error {
  constructor(readonly status: 400 | 422, message: string) {
    super(message);
    this.name = "RegisterTeacherFullTermError";
  }
}

export function isFullTermCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(instant.valueOf()) && instant.toISOString().slice(0, 10) === value;
}

/**
 * Resolves and validates the closing date inside the official learner term. A
 * caller-supplied date may be any calendar day in the term, including a
 * non-teaching boundary day, and may legitimately fall after today for a
 * full-term register (the register spans the whole learner term). A supplied
 * date is validated even when the term has no eligible day at all, so an
 * out-of-term request is a 400 rather than a silently empty sheet. When no date
 * is supplied the last eligible school day on or before today is used as a
 * conservative boundary; the builder instead supplies the term's last eligible
 * day so the default view is the whole term. `null` means the term has no
 * eligible day (explicit empty state).
 */
export function resolveFullTermClosingDate(input: {
  termStart: string;
  termEnd: string;
  today: string;
  closingDate?: string | null;
  eligibleDates: readonly string[];
}) {
  const { termStart, termEnd, today, closingDate, eligibleDates } = input;
  if (![termStart, termEnd, today].every(isFullTermCalendarDate) || termStart > termEnd) {
    throw new RegisterTeacherFullTermError(400, "The school-local date or official learner term is invalid.");
  }
  if (closingDate != null) {
    if (!isFullTermCalendarDate(closingDate)) {
      throw new RegisterTeacherFullTermError(400, "Choose a valid closing date.");
    }
    if (closingDate < termStart || closingDate > termEnd) {
      throw new RegisterTeacherFullTermError(400, "The closing date must fall inside the official learner term.");
    }
    return closingDate;
  }
  const boundary = today < termEnd ? today : termEnd;
  const eligible = eligibleDates.filter((date) => date <= boundary);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

/**
 * Explains how the school-included teaching-day count relates to the official
 * scheduled baseline.
 *
 * A school may open a replacement Saturday, so the included count can
 * legitimately exceed the scheduled Mon-Fri baseline. Printing the two numbers
 * without that explanation reads as a contradictory total on an official
 * document, so the renderers state the relationship explicitly. A net-zero
 * difference needs no explanation.
 */
export function fullTermDayBasis(
  scheduledTeachingDayCount: number,
  includedTeachingDayCount: number,
) {
  const delta = includedTeachingDayCount - scheduledTeachingDayCount;
  if (delta === 0) return { delta, detail: null as string | null };
  const unit = Math.abs(delta) === 1 ? "day" : "days";
  return {
    delta,
    detail: delta > 0
      ? `${delta} school-added replacement ${unit}`
      : `${Math.abs(delta)} school closure ${unit}`,
  };
}

/**
 * Full-term enrolment evidence.
 *
 * Identical repeated rows are deduplicated. Any two independent enrolments for
 * the same learner that both cover the same eligible learner-day fail closed:
 * without an authoritative identity merge the register cannot decide whether
 * that is one learner-day or two. Disjoint re-entry is preserved because the
 * intervals do not share an eligible day. Interclass transfers are separate
 * class scopes and are therefore not combined here.
 */
export function fullTermEnrolments(
  rows: readonly RegisterTeacherEnrolmentRow[],
  eligibleDates: readonly string[],
) {
  const byId = new Map<string, RegisterTeacherEnrolmentRow>();
  const occupiedByLearner = new Map<string, Set<string>>();
  for (const row of rows) {
    const prior = byId.get(row.id);
    if (prior) {
      if (JSON.stringify(prior) === JSON.stringify(row)) continue;
      throw new RegisterTeacherFullTermError(422, "Conflicting enrolment evidence. This register cannot be certified.");
    }
    const start = String(row.enrolled_from).slice(0, 10);
    const end = row.enrolled_to ? String(row.enrolled_to).slice(0, 10) : null;
    const activeDates = eligibleDates.filter((date) => date >= start && (!end || date <= end));
    if (!activeDates.length) continue;
    const learnerDays = occupiedByLearner.get(row.learner_id) ?? new Set<string>();
    if (activeDates.some((date) => learnerDays.has(date))) {
      throw new RegisterTeacherFullTermError(422, "Overlapping enrolments cover the same eligible learner-day. This register cannot be certified.");
    }
    for (const date of activeDates) learnerDays.add(date);
    occupiedByLearner.set(row.learner_id, learnerDays);
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export type RegisterTeacherFullTermCertificationEvidence = {
  schoolId: string;
  /** A class-level key is mandatory. A school-only summary is not evidence. */
  classId: string | null;
  termId: string | null;
  cutoff: string;
  snapshotId: string | null;
};

/**
 * Canonical, deterministic serialization of the actual exported attendance
 * content. It deliberately excludes sensitive learner fields (date of birth,
 * guardian contact, etc.) — only the governed attendance identity and marks feed
 * the fingerprint. Learners and mark keys are ordered so identical content
 * always yields the same digest regardless of source ordering.
 */
export function canonicalFullTermAttendance(document: RegisterTeacherDocument): unknown {
  return document.sections.map((section) => ({
    sex: section.sex,
    learners: [...section.learners]
      .sort((a, b) => (a.learnerId < b.learnerId ? -1 : a.learnerId > b.learnerId ? 1 : 0))
      .map((learner) => ({
        learnerId: learner.learnerId,
        surname: learner.surname,
        givenNames: learner.givenNames,
        sex: learner.sex,
        enrolledFrom: learner.enrolledFrom,
        enrolledTo: learner.enrolledTo,
        marks: Object.fromEntries(
          Object.entries(learner.marks).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ),
        attended: learner.attended,
        absent: learner.absent,
        possible: learner.possible,
        termAttended: learner.termAttended,
        termAbsent: learner.termAbsent,
        termDays: learner.termDays,
      })),
  }));
}

/**
 * Independently derived export snapshot identifier.
 *
 * The identifier binds to the authoritative export scope — school, class, term
 * and closing (cutoff) date — AND to a verifiable digest of the canonical
 * exported attendance content. Because the digest covers the actual marks, two
 * exports that differ only by an attendance mark necessarily produce different
 * ids, so an authoritative class-level finalization cannot certify the sheet
 * with a stale or mismatched snapshot. The digest is computed server-side from
 * the resolved document, so a caller cannot supply an arbitrary value to claim
 * certification. A snapshot that does not equal this id stays provisional.
 */
export function computeFullTermExportSnapshotId(input: {
  schoolId: string;
  classId: string;
  termId: string | null;
  cutoff: string | null;
  document: RegisterTeacherDocument;
}): string {
  const canonical = JSON.stringify({
    scope: {
      schoolId: input.schoolId,
      classId: input.classId,
      termId: input.termId,
      cutoff: input.cutoff,
    },
    content: canonicalFullTermAttendance(input.document),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}

/**
 * Provisional/certified decision.
 *
 * Existing Official Attendance Summary finalization is school scoped, so a
 * matching school summary cannot certify this class register. Certification
 * requires authoritative evidence that explicitly covers school, class, term,
 * cutoff and the exact exported snapshot. The snapshot id must equal the value
 * independently derived from this export's actual content — a non-empty but
 * mismatched id (stale, unrelated, fabricated, or derived from different marks)
 * stays provisional. Until such evidence is supplied, the sheet stays
 * provisional even when the term has ended.
 */
export function resolveFullTermCertification(input: {
  scope: { schoolId: string; classId: string; termId: string | null; cutoff: string | null };
  document: RegisterTeacherDocument;
  evidence?: RegisterTeacherFullTermCertificationEvidence | null;
}): Pick<RegisterTeacherFullTermMetadata, "status" | "certificationNote"> {
  const { scope, document, evidence } = input;
  const expectedSnapshotId = computeFullTermExportSnapshotId({ ...scope, document });
  if (!evidence) {
    return {
      status: "provisional",
      certificationNote: "Provisional: no authoritative class-level finalization covers this school, class, term, closing date and snapshot.",
    };
  }
  const coversScope = evidence.schoolId === scope.schoolId
    && evidence.classId != null
    && evidence.classId === scope.classId
    && evidence.termId != null
    && evidence.termId === scope.termId
    && scope.cutoff != null
    && evidence.cutoff === scope.cutoff
    && evidence.snapshotId === expectedSnapshotId;
  return coversScope
    ? { status: "certified", certificationNote: "Certified by authoritative class-level finalization for this exact scope and snapshot." }
    : {
        status: "provisional",
        certificationNote: "Provisional: available finalization evidence does not cover this exact school, class, term, closing date and snapshot.",
      };
}
