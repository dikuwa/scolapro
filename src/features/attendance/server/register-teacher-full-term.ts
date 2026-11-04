import type { RegisterTeacherEnrolmentRow } from "@/features/attendance/server/register-teacher-document";

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
  scheduledTeachingDayCount: number;
  includedTeachingDayCount: number;
  possibleLearnerDays: number;
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
 * Resolves the closing date against the official learner term and the
 * school-local clock. A caller-supplied date may be any calendar day inside the
 * term, including a non-teaching boundary day; it may never be in the future or
 * outside the learner term. The default is the last eligible school day on or
 * before today. `null` means the term has no eligible day yet (explicit empty
 * state), not a silent fallback to the whole term.
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
    if (closingDate > today) {
      throw new RegisterTeacherFullTermError(400, "The closing date cannot be later than the school-local date.");
    }
    return closingDate;
  }
  const boundary = today < termEnd ? today : termEnd;
  const eligible = eligibleDates.filter((date) => date <= boundary);
  return eligible.length ? eligible[eligible.length - 1] : null;
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
 * Provisional/certified decision.
 *
 * Existing Official Attendance Summary finalization is school scoped, so a
 * matching school summary cannot certify this class register. Certification
 * requires authoritative evidence that explicitly covers school, class, term,
 * cutoff and the exported snapshot. Until such evidence is supplied, the sheet
 * stays provisional even when the term has ended.
 */
export function resolveFullTermCertification(input: {
  scope: { schoolId: string; classId: string; termId: string | null; cutoff: string | null };
  evidence?: RegisterTeacherFullTermCertificationEvidence | null;
}): Pick<RegisterTeacherFullTermMetadata, "status" | "certificationNote"> {
  const { scope, evidence } = input;
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
    && Boolean(evidence.snapshotId);
  return coversScope
    ? { status: "certified", certificationNote: "Certified by authoritative class-level finalization for this exact scope and snapshot." }
    : {
        status: "provisional",
        certificationNote: "Provisional: available finalization evidence does not cover this exact school, class, term, closing date and snapshot.",
      };
}
