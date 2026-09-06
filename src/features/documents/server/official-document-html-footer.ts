import "server-only";

import { escapeOfficialDocumentHtml } from "@/features/documents/server/official-document-html-header";

type OfficialDocumentHtmlFooterInput = {
  left: string;
  right: string;
};

export function renderOfficialDocumentHtmlFooter(input: OfficialDocumentHtmlFooterInput): string {
  return `<footer class="document-meta">\n    <span>${escapeOfficialDocumentHtml(input.left)}</span>\n    <span>${escapeOfficialDocumentHtml(input.right)}</span>\n  </footer>`;
}
