/**
 * Learner-facing attendance boundaries from the governed operational calendar.
 * Teacher opening/closing dates do not qualify as learner attendance dates.
 */
export type LearnerTermWindow = {
  learner_starts_on: string | null;
  learner_ends_on: string | null;
};

export type AttendanceDayKind =
  | "teaching"
  | "in_term_non_teaching"
  | "out_of_term"
  | "unverified";

export type AttendanceDayDecision = {
  impact: string;
  reason: string | null;
  kind: AttendanceDayKind;
  eligible: boolean;
};

export type AttendanceDayOverride = {
  isSchoolDay: boolean;
  teachingImpact?: string | null;
  reason?: string | null;
};

export function learnerCalendarRestriction(date: string, terms: LearnerTermWindow[]): string | null {
  const configured = terms.filter((row) => row.learner_starts_on && row.learner_ends_on);
  // A partially configured year cannot safely prove that a date falls
  // outside learner terms. Defer to the existing per-day calendar resolver
  // until *every* term has authoritative learner opening and closing dates.
  if (!configured.length || configured.length !== terms.length) return null;
  if (configured.some((row) => row.learner_starts_on! <= date && date <= row.learner_ends_on!)) return null;
  const opening = configured.map((row) => row.learner_starts_on!).sort()[0];
  const closing = configured.map((row) => row.learner_ends_on!).sort().at(-1)!;
  if (date < opening) return "Before learner opening";
  if (date > closing) return "After learner closing";
  return "Between learner terms";
}

/**
 * Application-side projection of the authoritative expected-school-day order:
 * an explicit school override wins, then learner term bounds, then the shared
 * teaching-impact resolver. The database remains the final write authority via
 * app_private.is_expected_school_day; this projection keeps entry, summaries,
 * offline replay and documents aligned before a mutation reaches that guard.
 */
export function resolveAttendanceDayDecision(input: {
  date: string;
  terms: LearnerTermWindow[];
  resolvedImpact: string | null;
  override?: AttendanceDayOverride | null;
  resolverAvailable?: boolean;
}): AttendanceDayDecision {
  const overrideReason = input.override?.reason?.trim() || null;
  const restriction = learnerCalendarRestriction(input.date, input.terms);
  if (input.override) {
    if (!input.override.isSchoolDay) {
      return {
        impact: "NO_TEACHING",
        reason: overrideReason ?? restriction ?? "School calendar closure",
        kind: restriction ? "out_of_term" : "in_term_non_teaching",
        eligible: false,
      };
    }
    const impact = input.override.teachingImpact || input.resolvedImpact || "NORMAL";
    return {
      impact,
      reason: overrideReason,
      kind: "teaching",
      eligible: impact !== "NO_TEACHING",
    };
  }

  if (restriction) {
    return { impact: "NO_TEACHING", reason: restriction, kind: "out_of_term", eligible: false };
  }
  if (input.resolverAvailable === false || !input.resolvedImpact) {
    return {
      impact: "NO_TEACHING",
      reason: "School-day eligibility could not be verified",
      kind: "unverified",
      eligible: false,
    };
  }
  if (input.resolvedImpact === "NO_TEACHING") {
    return {
      impact: "NO_TEACHING",
      reason: "Non-teaching day in the school calendar",
      kind: "in_term_non_teaching",
      eligible: false,
    };
  }
  return { impact: input.resolvedImpact, reason: null, kind: "teaching", eligible: true };
}
