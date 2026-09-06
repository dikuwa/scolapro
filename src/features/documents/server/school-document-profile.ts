import "server-only";

export type SchoolDocumentNameFont = "default" | "old_english";

export type SchoolDocumentProfile = {
  schoolName: string;
  schoolEmisNumber: string;
  formerName: string;
  logoUrl: string;
  logoStoragePath: string;
  physicalAddress: string;
  telephone: string;
  fax: string;
  email: string;
  postalAddress: string;
  town: string;
  schoolNameFont: SchoolDocumentNameFont;
};

type JsonRecord = Record<string, unknown>;

type BuildSchoolDocumentProfileInput = {
  fallbackSchoolName: string;
  fallbackSchoolEmisNumber?: string | null;
  schoolIdentity: unknown;
  schoolDocumentProfile: unknown;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizedSchoolName(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Repository-bundled branding is a last-resort fallback only. An explicit
 * frozen logo_url or logo_storage_path from the document snapshot always wins.
 * Keeping this resolver here makes known-school defaults reusable across all
 * official document families without hard-coding a school inside a renderer.
 */
function bundledSchoolLogoUrl(schoolName: string): string {
  switch (normalizedSchoolName(schoolName)) {
    case "namib high school":
    case "namib high":
      return "/brand/schools/namib-high/crest.svg";
    default:
      return "";
  }
}

/**
 * Canonical frozen school identity used by official generated documents.
 *
 * The document snapshot remains authoritative. Live school-table values are
 * only fallbacks for fields that were absent from the frozen snapshot, so a
 * regenerated historical document cannot silently pick up later profile edits.
 */
export function buildSchoolDocumentProfile(input: BuildSchoolDocumentProfileInput): SchoolDocumentProfile {
  const identity = record(input.schoolIdentity);
  const profile = record(input.schoolDocumentProfile);
  const schoolName = text(identity.name) || text(input.fallbackSchoolName);
  const logoStoragePath = text(profile.logo_storage_path);
  const explicitLogoUrl = text(profile.logo_url);

  return {
    schoolName,
    schoolEmisNumber: text(identity.emis_number) || text(input.fallbackSchoolEmisNumber),
    formerName: text(profile.former_name),
    logoUrl: explicitLogoUrl || (logoStoragePath ? "" : bundledSchoolLogoUrl(schoolName)),
    logoStoragePath,
    physicalAddress: text(profile.physical_address),
    telephone: text(profile.telephone || profile.phone),
    fax: text(profile.fax),
    email: text(profile.email),
    postalAddress: text(profile.postal_address),
    town: text(profile.town) || text(identity.town),
    schoolNameFont: text(profile.school_name_font).toLowerCase() === "old_english" ? "old_english" : "default",
  };
}
