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
