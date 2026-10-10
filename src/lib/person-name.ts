function formatWord(word: string) {
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (!letters) return word;
  const isUniformCase = letters === letters.toUpperCase() || letters === letters.toLowerCase();
  if (!isUniformCase) return word;

  return word
    .split(/([-'’])/)
    .map((part) => {
      if (part === "-" || part === "'" || part === "’" || !part) return part;
      return part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase();
    })
    .join("");
}

/**
 * Display-only normalization for person names. It fixes fully upper/lower-case imports,
 * collapses whitespace, and ignores punctuation-only placeholder fragments such as a
 * lone period without rewriting authoritative identity data or damaging intentional
 * mixed-case names and initials such as "J.".
 */
export function formatPersonName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .map(formatWord)
    .join(" ");
}

/**
 * Canonical school-facing learner name formatter.
 *
 * Returns **Surname GivenNames** (e.g. "Mbuti Angel") for all school
 * registers, class lists, reports and exported documents in accordance with
 * ScolaPro display policy (Issue #1208).
 *
 * ### Casing normalization
 * The underlying `formatPersonName` helper normalises names that are stored
 * entirely in UPPER CASE or entirely in lower case (a common artefact of bulk
 * CSV imports), converting them to Title Case while preserving intentional
 * mixed-case values — for example "J." initials, hyphenated names like
 * "van der Merwe" or "O'Brien", and names whose source capitalization is
 * already mixed. The source identity fields in the database are **never**
 * rewritten; normalization is display-only and applied at read time.
 *
 * ### Search
 * Because the display label is now Surname-first, callers that offer
 * free-text search must also accept GivenNames-Surname order. Use the
 * `nameAlternate` field (populated alongside `name` wherever this function is
 * used in attendance/register server queries) to provide a second haystack
 * for client-side filters.
 *
 * - Source identity fields are never modified.
 * - Compound/multi-part surnames, hyphens, accents and intentional
 *   capitalization are preserved through `formatPersonName`.
 * - When only one of the two name parts is present the non-empty part is
 *   returned without a trailing/leading space.
 * - Falls back to `fallback` (default `"Learner"`) when both fields are empty.
 */
export function formatLearnerName(
  first_names: string | null | undefined,
  surname: string | null | undefined,
  fallback = "Learner",
): string {
  const s = formatPersonName(surname);
  const g = formatPersonName(first_names);
  const combined = [s, g].filter(Boolean).join(" ");
  return combined || fallback;
}
