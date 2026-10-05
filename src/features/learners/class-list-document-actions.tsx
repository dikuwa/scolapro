"use client";

import { OfficialDocumentActions } from "@/components/documents/official-document-actions";

export function ClassListDocumentActions({
  baseHref,
  compact = false,
}: {
  baseHref: string;
  compact?: boolean;
  batch?: boolean;
}) {
  return (
    <OfficialDocumentActions
      previewHref={`${baseHref}&format=pdf&preview=1`}
      downloadHref={`${baseHref}&format=pdf`}
      spreadsheetHref={`${baseHref}&format=xlsx`}
      compact={compact}
      previewLabel="Preview / Print"
      downloadLabel="PDF"
      spreadsheetLabel="Excel"
    />
  );
}
