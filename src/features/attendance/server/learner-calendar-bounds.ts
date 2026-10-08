/**
 * Learner-facing attendance boundaries from the governed operational calendar.
 * Teacher opening/closing dates do not qualify as learner attendance dates.
 */
export type LearnerTermWindow = {
  learner_starts_on: string | null;
  learner_ends_on: string | null;
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
