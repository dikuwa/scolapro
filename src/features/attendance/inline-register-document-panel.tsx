"use client";

import { useEffect, useMemo, useState } from "react";
import { FileWarning, RefreshCw } from "lucide-react";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { Spinner } from "@/components/ui/spinner";
import {
  invalidateInlineRegisterDocument,
  inlineRegisterDocumentKey,
  resolveInlineRegisterDocument,
  type InlineRegisterDocument,
  type InlineRegisterDocumentSelection,
} from "@/features/attendance/inline-register-document";

type InlineDocumentState =
  | { status: "error"; requestKey: string; message: string }
  | { status: "success"; requestKey: string; document: InlineRegisterDocument };

type InlineDocumentUrls = {
  previewUrl: string;
  downloadUrl: string;
  fileName: string;
  identity: string;
};

function pdfBlob(document: InlineRegisterDocument) {
  const binary = window.atob(document.pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "application/pdf" });
}

/** Saves the resolved bundle's own PDF bytes; no second document request is made. */
function downloadResolvedPdf(urls: InlineDocumentUrls) {
  const anchor = document.createElement("a");
  anchor.href = urls.downloadUrl;
  anchor.download = urls.fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function InlineRegisterDocumentPanel({
  selection,
  title,
}: {
  selection: InlineRegisterDocumentSelection | null;
  title: string;
}) {
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<InlineDocumentState | null>(null);
  const requestKey = selection ? `${inlineRegisterDocumentKey(selection)}:${retryCount}` : "";

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    if (!navigator.onLine) {
      queueMicrotask(() => {
        if (!cancelled) setState({ status: "error", requestKey, message: "You are offline. Reconnect to load this register document." });
      });
      return () => { cancelled = true; };
    }

    const controller = new AbortController();
    void resolveInlineRegisterDocument(selection, controller.signal)
      .then((document) => setState({ status: "success", requestKey, document }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = !navigator.onLine
          ? "You are offline. Reconnect to load this register document."
          : error instanceof Error && error.message
            ? error.message
            : "The register document could not be prepared.";
        setState({ status: "error", requestKey, message });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestKey, selection]);

  // One resolved document backs the inline sheet, the full-screen preview and the PDF download.
  const documentUrls = useMemo(() => {
    if (state?.status !== "success") return null;
    const previewUrl = URL.createObjectURL(new Blob([state.document.html], { type: "text/html;charset=utf-8" }));
    const downloadUrl = URL.createObjectURL(pdfBlob(state.document));
    return { previewUrl, downloadUrl, fileName: state.document.fileName, identity: state.document.identity };
  }, [state]);

  useEffect(() => () => {
    if (!documentUrls) return;
    URL.revokeObjectURL(documentUrls.previewUrl);
    URL.revokeObjectURL(documentUrls.downloadUrl);
  }, [documentUrls]);

  if (!selection) {
    return (
      <div className="border-t border-border-subtle bg-surface-subtle px-4 py-8 text-center sm:px-5">
        <p className="text-sm font-semibold text-foreground">Choose a complete register period</p>
        <p className="mt-1 text-xs text-muted-foreground">Select a class, academic term and applicable week range to display the document.</p>
      </div>
    );
  }

  if (!state || state.requestKey !== requestKey) {
    return (
      <div className="flex min-h-64 items-center justify-center border-t border-border-subtle bg-surface-subtle" aria-live="polite" aria-busy="true">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Spinner className="size-5 text-brand" />
          <span>Preparing register document…</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="border-t border-border-subtle bg-surface-subtle px-4 py-8 sm:px-5" role="alert">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <FileWarning className="size-5 text-[color:var(--danger)]" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-foreground">Register document unavailable</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{state.message}</p>
          <button
            type="button"
            onClick={() => {
              invalidateInlineRegisterDocument(selection);
              setRetryCount((count) => count + 1);
            }}
            className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border-subtle bg-surface-subtle p-3 sm:p-4" data-document-identity={state.document.identity}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">The on-screen, print and PDF copies share document <span className="font-semibold text-foreground">{state.document.identity.slice(0, 8)}</span>.</p>
        <OfficialDocumentActions
          previewHref={documentUrls?.previewUrl}
          previewDownloadHref={documentUrls?.downloadUrl}
          previewTitle={title}
          previewDescription="The same resolved register document shown in the workspace."
          previewLabel="Preview / Print"
          downloadLabel="PDF"
          onDownload={() => { if (documentUrls) downloadResolvedPdf(documentUrls); }}
          compact
          disabled={!documentUrls}
        />
      </div>
      <div className="h-[70vh] min-h-96 overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-white shadow-[var(--shadow-xs)]">
        <iframe
          title={`${title} inline document`}
          srcDoc={state.document.html}
          className="size-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
