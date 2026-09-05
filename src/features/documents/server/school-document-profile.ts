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

  return {
    schoolName: text(identity.name) || text(input.fallbackSchoolName),
    schoolEmisNumber: text(identity.emis_number) || text(input.fallbackSchoolEmisNumber),
    formerName: text(profile.former_name),
    logoUrl: text(profile.logo_url),
    logoStoragePath: text(profile.logo_storage_path),
    physicalAddress: text(profile.physical_address),
    telephone: text(profile.telephone || profile.phone),
    fax: text(profile.fax),
    email: text(profile.email),
    postalAddress: text(profile.postal_address),
    town: text(profile.town) || text(identity.town),
    schoolNameFont: text(profile.school_name_font).toLowerCase() === "old_english" ? "old_english" : "default",
  };
}
