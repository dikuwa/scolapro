import "server-only";

import type { SchoolDocumentNameFont } from "@/features/documents/server/school-document-profile";

export type OfficialDocumentHeaderMode = "internal_school" | "external_correspondence";

export type OfficialDocumentType =
  | "admission_application"
  | "report_card"
  | "academic_schedule"
  | "external_correspondence"
  | "crc_outbound_document"
  | "class_list"
  | "sports_house_roster"
  | "room_inventory"
  | "attendance_summary"
  | "teaching_print_pack"
  | "teaching_plan"
  | "teaching_files_inspection_pack"
  | "subject_file_inspection_pack"
  | "detention_roster"
  | "academic_analysis"
  | "learner_transfer_form";

export type OfficialDocumentHeaderFamily =
  | "school_document"
  | "official_external"
  | "prescribed_statutory";

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

export function officialDocumentHeaderFamilyForType(
  documentType: OfficialDocumentType,
): OfficialDocumentHeaderFamily {
  switch (documentType) {
    case "admission_application":
    case "report_card":
    case "academic_schedule":
    case "external_correspondence":
    case "crc_outbound_document":
    case "attendance_summary":
      return "official_external";
    case "learner_transfer_form":
      return "prescribed_statutory";
    case "class_list":
    case "sports_house_roster":
    case "room_inventory":
    case "teaching_print_pack":
    case "teaching_plan":
    case "teaching_files_inspection_pack":
    case "subject_file_inspection_pack":
    case "detention_roster":
    case "academic_analysis":
      return "school_document";
  }
}

export function officialDocumentHeaderModeForType(
  documentType: OfficialDocumentType,
): OfficialDocumentHeaderMode {
  const family = officialDocumentHeaderFamilyForType(documentType);
  return family === "school_document" ? "internal_school" : "external_correspondence";
}

export type OfficialDocumentHeaderContactLine = {
  key: "address" | "telephone" | "fax" | "email";
  label: string;
  value: string;
  text: string;
};

export type InternalSchoolDocumentHeaderContext = {
  title: string;
  primaryContext?: string | null;
  secondaryContext?: string | null;
  summary?: string | null;
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

export function normalizeInternalSchoolDocumentHeaderContext(
  context: InternalSchoolDocumentHeaderContext,
): Required<InternalSchoolDocumentHeaderContext> {
  return {
    title: context.title.trim(),
    primaryContext: context.primaryContext?.trim() ?? "",
    secondaryContext: context.secondaryContext?.trim() ?? "",
    summary: context.summary?.trim() ?? "",
  };
}

/**
 * Shared semantic header contract for ScolaPro official school documents.
 *
 * The frozen SchoolDocumentProfile remains authoritative. This layer only
 * normalizes how the same identity/contact fields are presented so HTML, PDF,
 * XLSX and later official document families cannot drift into different labels
 * or field ordering.
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
