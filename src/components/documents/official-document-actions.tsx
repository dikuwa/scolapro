"use client";

import Link from "next/link";
import { Download, FileSpreadsheet, Printer } from "lucide-react";

export function OfficialDocumentActions({
  previewHref,
  downloadHref,
  spreadsheetHref,
  compact = false,
  previewLabel = "Preview / Print",
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
  downloadLabel?: string;
  spreadsheetLabel?: string;
  onPreview?: () => void;
  onDownload?: () => void;
  disabled?: boolean;
}) {
  const sizeClass = compact
    ? "min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem]"
    : "min-h-9 rounded-[var(--radius-sm)] px-3 text-xs";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onPreview ? (
        <button type="button" onClick={onPreview} disabled={disabled} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass}`}>
          <Printer aria-hidden="true" className="size-3.5" />
          {previewLabel}
        </button>
      ) : previewHref ? (
        <Link href={previewHref} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated ${sizeClass}`}>
          <Printer aria-hidden="true" className="size-3.5" />
          {previewLabel}
        </Link>
      ) : null}
      {onDownload ? (
        <button type="button" onClick={onDownload} disabled={disabled} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass}`}>
          <Download aria-hidden="true" className="size-3.5" />
          {downloadLabel}
        </button>
      ) : downloadHref ? (
        <a href={downloadHref} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated ${sizeClass}`}>
          <Download aria-hidden="true" className="size-3.5" />
          {downloadLabel}
        </a>
      ) : null}
      {spreadsheetHref ? (
        <a
          href={spreadsheetHref}
          className={`inline-flex items-center gap-1.5 bg-brand-soft font-semibold text-brand-strong transition hover:bg-brand-soft/80 ${sizeClass}`}
        >
          <FileSpreadsheet aria-hidden="true" className="size-3.5" />
          {spreadsheetLabel}
        </a>
      ) : null}
    </div>
  );
}
