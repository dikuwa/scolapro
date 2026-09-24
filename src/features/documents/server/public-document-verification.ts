import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOfficialDocumentVerificationToken } from "../official-document-verification-payload";

export type PublicOfficialDocumentVerification = {
  schoolName: string;
  documentType: string;
  scolaproReference: string;
  issuedOn: string;
  validityStatus: "valid" | "superseded" | "revoked";
  revision: number;
  confirmation: string;
};

type VerificationRow = {
  school_name: string;
  document_type: string;
  scolapro_reference: string;
  issued_on: string;
  validity_status: PublicOfficialDocumentVerification["validityStatus"];
  revision: number;
  confirmation: string;
};

export async function getPublicOfficialDocumentVerification(
  token: string,
): Promise<PublicOfficialDocumentVerification | null> {
  if (!isOfficialDocumentVerificationToken(token)) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("resolve_official_document_verification", {
      p_token: token,
    });
    if (error) return null;

    const row = (Array.isArray(data) ? data[0] : data) as VerificationRow | undefined;
    if (!row) return null;

    return {
      schoolName: row.school_name,
      documentType: row.document_type,
      scolaproReference: row.scolapro_reference,
      issuedOn: row.issued_on,
      validityStatus: row.validity_status,
      revision: row.revision,
      confirmation: row.confirmation,
    };
  } catch {
    return null;
  }
}
