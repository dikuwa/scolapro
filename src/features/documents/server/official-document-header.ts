import "server-only";

import type { SchoolDocumentNameFont } from "@/features/documents/server/school-document-profile";

export type OfficialDocumentHeaderMode = "internal_school" | "external_correspondence";

export type OfficialDocumentType =
  | "class_list"
  | "teaching_print_pack"
  | "report_card"
  | "external_correspondence";

export type OfficialDocumentHeaderProvenance = {
  source: "live_school_profile" | "frozen_snapshot";
  governedAssetKey: "namibia-coat-of-arms";
  governedAssetVersion: string;
};

export const PLATFORM_GOVERNED_NAMIBIA_COAT_OF_ARMS = Object.freeze({
  key: "namibia-coat-of-arms" as const,
  version: "2026-09-22",
  url: "/brand/governed/namibia-coat-of-arms.svg",
  alt: "Coat of Arms of Namibia",
});

export function officialDocumentHeaderModeForType(
  documentType: OfficialDocumentType,
): OfficialDocumentHeaderMode {
  return documentType === "external_correspondence" ? "external_correspondence" : "internal_school";
}

export type OfficialDocumentHeaderContactLine = {
  key: "address" | "telephone" | "fax" | "email";
  label: string;
  value: string;
  text: string;
};

export type OfficialDocumentHeaderModel = {
  mode: OfficialDocumentHeaderMode;
  schoolName: string;
  schoolEmisNumber: string;
  formerName: string;
  logoUrl: string;
  logoStoragePath: string;
  schoolNameFont: SchoolDocumentNameFont;
  contactLines: OfficialDocumentHeaderContactLine[];
  postalLines: string[];
  governedCoatOfArms: typeof PLATFORM_GOVERNED_NAMIBIA_COAT_OF_ARMS;
  provenance: OfficialDocumentHeaderProvenance;
};

export type OfficialDocumentHeaderBuildOptions = {
  mode?: OfficialDocumentHeaderMode;
  provenanceSource?: OfficialDocumentHeaderProvenance["source"];
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
  options: OfficialDocumentHeaderBuildOptions = {},
): OfficialDocumentHeaderModel {
  const contactLines = [
    contactLine("address", "Address", profile.physicalAddress),
    contactLine("telephone", "Tel", profile.telephone),
    contactLine("fax", "Fax", profile.fax),
    contactLine("email", "Email", profile.email),
  ].filter((line): line is OfficialDocumentHeaderContactLine => line !== null);

  return {
    mode: options.mode ?? "internal_school",
    schoolName: profile.schoolName.trim(),
    schoolEmisNumber: profile.schoolEmisNumber.trim(),
    formerName: profile.formerName.trim(),
    logoUrl: profile.logoUrl.trim(),
    logoStoragePath: profile.logoStoragePath.trim(),
    schoolNameFont: profile.schoolNameFont,
    contactLines,
    postalLines: [profile.postalAddress, profile.town].map((line) => line.trim()).filter(Boolean),
    governedCoatOfArms: PLATFORM_GOVERNED_NAMIBIA_COAT_OF_ARMS,
    provenance: {
      source: options.provenanceSource ?? "live_school_profile",
      governedAssetKey: PLATFORM_GOVERNED_NAMIBIA_COAT_OF_ARMS.key,
      governedAssetVersion: PLATFORM_GOVERNED_NAMIBIA_COAT_OF_ARMS.version,
    },
  };
}
