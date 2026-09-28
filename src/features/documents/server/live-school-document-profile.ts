import "server-only";

import {
  buildOfficialDocumentHeaderModel,
  type OfficialDocumentHeaderMode,
  type OfficialDocumentHeaderModel,
} from "@/features/documents/server/official-document-header";
import { buildSchoolDocumentProfile, type SchoolDocumentProfile } from "@/features/documents/server/school-document-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Bound on optional-asset retrieval from private document storage (issue #863).
 * The signed URL only decorates the header; it must never hold the export
 * request hostage. Any failure or stall falls through to bundled/no logo.
 */
const SCHOOL_DOCUMENT_SIGNING_TIMEOUT_MS = 4000;

function withAssetTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), SCHOOL_DOCUMENT_SIGNING_TIMEOUT_MS);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

type SignedLogoResult = {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
};

const SIGNED_LOGO_UNAVAILABLE: SignedLogoResult = {
  data: null,
  error: { message: "Optional school logo is unavailable." },
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

/**
 * Loads the current school identity and document profile for newly generated
 * official documents. Historical report cards continue to render from their
 * frozen snapshot profile instead of calling this live loader.
 */
export async function getLiveSchoolDocumentProfile(schoolId: string): Promise<SchoolDocumentProfile> {
  const supabase = await createSupabaseServerClient();
  const [schoolResult, settingsResult] = await Promise.all([
    supabase.from("schools").select("name,emis_number,town").eq("id", schoolId).maybeSingle(),
    supabase.rpc("get_report_card_school_settings", { p_school_id: schoolId }),
  ]);

  if (schoolResult.error || !schoolResult.data) throw new Error("Unable to load school identity for this document.");
  if (settingsResult.error) throw new Error("Unable to load school document profile.");

  const root = record(settingsResult.data);
  const profile = record(root.document_profile);
  const logoStoragePath = String(profile.logo_storage_path ?? "").trim();
  let signedLogoUrl = "";
  let resolvedLogoStoragePath = logoStoragePath;

  if (logoStoragePath) {
    const signedLogo = await withAssetTimeout(
      supabase.storage
        .from("school-document-assets")
        .createSignedUrl(logoStoragePath, 3600),
      SIGNED_LOGO_UNAVAILABLE,
    );
    const logoError = signedLogo.error;
    if (logoError) {
      console.warn("school document logo unavailable; continuing with profile or bundled fallback", {
        schoolId,
        message: logoError.message,
      });
      resolvedLogoStoragePath = "";
    } else {
      signedLogoUrl = signedLogo.data?.signedUrl ?? "";
    }
  }

  return buildSchoolDocumentProfile({
    fallbackSchoolName: schoolResult.data.name,
    fallbackSchoolEmisNumber: schoolResult.data.emis_number,
    schoolIdentity: {
      name: schoolResult.data.name,
      emis_number: schoolResult.data.emis_number,
      town: schoolResult.data.town,
    },
    schoolDocumentProfile: {
      ...profile,
      logo_url: signedLogoUrl || profile.logo_url,
      logo_storage_path: resolvedLogoStoragePath,
    },
  });
}

/**
 * Resolves a live governed header without allowing school settings to select
 * or replace platform-owned assets. Existing operational documents should
 * request `internal_school`; external correspondence is opt-in by its
 * document family.
 */
export async function getLiveSchoolDocumentHeader(
  schoolId: string,
  mode: OfficialDocumentHeaderMode = "internal_school",
): Promise<OfficialDocumentHeaderModel> {
  const profile = await getLiveSchoolDocumentProfile(schoolId);
  return buildOfficialDocumentHeaderModel(profile, {
    mode,
    provenanceSource: "live_school_profile",
  });
}
