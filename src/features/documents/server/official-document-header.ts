import "server-only";

import type { SchoolDocumentNameFont } from "@/features/documents/server/school-document-profile";

export type OfficialDocumentHeaderContactLine = {
  key: "address" | "telephone" | "fax" | "email";
  label: string;
  value: string;
  text: string;
};

export type OfficialDocumentHeaderModel = {
  schoolName: string;
  schoolEmisNumber: string;
  formerName: string;
  logoUrl: string;
  logoStoragePath: string;
  schoolNameFont: SchoolDocumentNameFont;
  contactLines: OfficialDocumentHeaderContactLine[];
  postalLines: string[];
};

type OfficialDocumentHeaderProfile = {
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

function contactLine(
  key: OfficialDocumentHeaderContactLine["key"],
  label: string,
  value: string,
): OfficialDocumentHeaderContactLine | null {
  const normalized = value.trim();
  if (!normalized) return null;
  return { key, label, value: normalized, text: `${label}: ${normalized}` };
}

/**
 * Shared semantic header contract for ScolaPro official school documents.
 *
 * The frozen SchoolDocumentProfile remains authoritative. This layer only
 * normalizes how the same identity/contact fields are presented so HTML, PDF,
 * class lists, report cards, and later official document families cannot drift
 * into different labels or field ordering.
 */
export function buildOfficialDocumentHeaderModel(
  profile: OfficialDocumentHeaderProfile,
): OfficialDocumentHeaderModel {
  const contactLines = [
    contactLine("address", "Address", profile.physicalAddress),
    contactLine("telephone", "Tel", profile.telephone),
    contactLine("fax", "Fax", profile.fax),
    contactLine("email", "Email", profile.email),
  ].filter((line): line is OfficialDocumentHeaderContactLine => line !== null);

  return {
    schoolName: profile.schoolName.trim(),
    schoolEmisNumber: profile.schoolEmisNumber.trim(),
    formerName: profile.formerName.trim(),
    logoUrl: profile.logoUrl.trim(),
    logoStoragePath: profile.logoStoragePath.trim(),
    schoolNameFont: profile.schoolNameFont,
    contactLines,
    postalLines: [profile.postalAddress, profile.town].map((line) => line.trim()).filter(Boolean),
  };
}
