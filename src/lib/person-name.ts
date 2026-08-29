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
 * Display-only normalization for person names. It fixes fully upper/lower-case imports
 * without rewriting authoritative identity data or damaging intentional mixed-case names.
 */
export function formatPersonName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(formatWord)
    .join(" ");
}
