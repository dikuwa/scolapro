import "server-only";

export type OfficialDocumentMetadata = {
  snapshotLine: string;
  certificationLine: string;
  pageLabel: (pageNumber: number, pageCount: number) => string;
};

type BuildOfficialDocumentMetadataInput = {
  snapshotVersion: number;
  certifiedAt?: string | null;
  provenanceText: string;
};

/**
 * Shared provenance/footer wording for generated official documents.
 *
 * Renderers remain responsible for physical placement, but the semantic text
 * is kept in one place so HTML, PDF, and future document families do not drift.
 */
export function buildOfficialDocumentMetadata(input: BuildOfficialDocumentMetadataInput): OfficialDocumentMetadata {
  const certifiedAt = input.certifiedAt?.trim() ?? "";
  const provenanceText = input.provenanceText.trim();

  return {
    snapshotLine: `ScolaPro certified snapshot v${input.snapshotVersion} - ${provenanceText}`,
    certificationLine: certifiedAt ? `Certified ${certifiedAt}` : "Draft snapshot",
    pageLabel: (pageNumber, pageCount) => `Page ${pageNumber} of ${pageCount}`,
  };
}
