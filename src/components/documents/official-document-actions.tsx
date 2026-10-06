"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Printer, X } from "lucide-react";

export function OfficialDocumentActions({
  previewHref,
  downloadHref,
  spreadsheetHref,
  compact = false,
  previewLabel = "Preview / Print",
  previewTitle = "Document preview",
  previewDescription = "Preview remains inside ScolaPro.",
  downloadLabel = "PDF",
  spreadsheetLabel = "Excel",
  onPreview,
  onDownload,
  disabled = false,
}: {
  previewHref?: string;
  downloadHref?: string;
  spreadsheetHref?: string;
  compact?: boolean;
  previewLabel?: string;
  previewTitle?: string;
  previewDescription?: string;
  downloadLabel?: string;
  spreadsheetLabel?: string;
  onPreview?: () => void | boolean | Promise<void | boolean>;
  onDownload?: () => void;
  disabled?: boolean;
}) {
  const [activeAction, setActiveAction] = useState<"preview" | "download" | "spreadsheet" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const sizeClass = compact
    ? "min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem]"
    : "min-h-9 rounded-[var(--radius-sm)] px-3 text-xs";

  const previewIsPageAnchor = previewHref?.startsWith("#") ?? false;

  useEffect(() => {
    if (!previewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [previewOpen]);

  function beginAction(action: "preview" | "download" | "spreadsheet") {
    setActiveAction(action);
    window.setTimeout(() => setActiveAction((current) => current === action ? null : current), 2200);
  }

  async function runPreview() {
    beginAction("preview");
    const result = await onPreview?.();
    if (result === false) return;
    if (previewHref && !previewIsPageAnchor) setPreviewOpen(true);
  }

  const busy = disabled || activeAction !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {previewHref && previewIsPageAnchor ? (
          <Link href={previewHref} onClick={() => beginAction("preview")} aria-busy={activeAction === "preview"} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated ${busy ? "pointer-events-none opacity-60" : ""} ${sizeClass}`}>
            {activeAction === "preview" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Printer aria-hidden="true" className="size-3.5" />}
            {activeAction === "preview" ? "Opening preview…" : previewLabel}
          </Link>
        ) : previewHref || onPreview ? (
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={busy}
            aria-busy={activeAction === "preview"}
            className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass}`}
          >
            {activeAction === "preview" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Printer aria-hidden="true" className="size-3.5" />}
            {activeAction === "preview" ? "Opening preview…" : previewLabel}
          </button>
        ) : null}
        {onDownload ? (
          <button type="button" onClick={() => { beginAction("download"); onDownload(); }} disabled={busy} aria-busy={activeAction === "download"} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass}`}>
            {activeAction === "download" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Download aria-hidden="true" className="size-3.5" />}
            {activeAction === "download" ? "Preparing PDF…" : downloadLabel}
          </button>
        ) : downloadHref ? (
          <a href={downloadHref} onClick={() => beginAction("download")} aria-busy={activeAction === "download"} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated ${busy ? "pointer-events-none opacity-60" : ""} ${sizeClass}`}>
            {activeAction === "download" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Download aria-hidden="true" className="size-3.5" />}
            {activeAction === "download" ? "Preparing PDF…" : downloadLabel}
          </a>
        ) : null}
        {spreadsheetHref ? (
          <a
            href={spreadsheetHref}
            onClick={() => beginAction("spreadsheet")}
            aria-busy={activeAction === "spreadsheet"}
            className={`inline-flex items-center gap-1.5 bg-brand-soft font-semibold text-brand-strong transition hover:bg-brand-soft/80 ${busy ? "pointer-events-none opacity-60" : ""} ${sizeClass}`}
          >
            {activeAction === "spreadsheet" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="size-3.5" />}
            {activeAction === "spreadsheet" ? "Preparing Excel…" : spreadsheetLabel}
          </a>
        ) : null}
      </div>

      {previewOpen && previewHref && !previewIsPageAnchor ? (
        <div
          className="fixed inset-0 z-[170] bg-black/45 p-2 backdrop-blur-[1px] sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPreviewOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={previewTitle}
            className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-2xl sm:h-[calc(100dvh-2rem)]"
          >
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border-subtle bg-surface px-3 sm:px-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{previewTitle}</p>
                <p className="truncate text-[0.68rem] text-muted-foreground">{previewDescription}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--danger)] px-4 text-xs font-semibold text-white shadow-[var(--shadow-sm)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--danger)] focus-visible:ring-offset-2"
                aria-label="Close document preview"
              >
                <X className="size-4.5" strokeWidth={2.4} aria-hidden="true" />
                Close
              </button>
            </div>
            <iframe
              title={`${previewLabel} document preview`}
              src={previewHref}
              className="min-h-0 w-full flex-1 border-0 bg-white"
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
