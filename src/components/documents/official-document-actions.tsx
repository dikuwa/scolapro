"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Printer } from "lucide-react";

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
  const [activeAction, setActiveAction] = useState<"preview" | "download" | "spreadsheet" | null>(null);
  const sizeClass = compact
    ? "min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.7rem]"
    : "min-h-9 rounded-[var(--radius-sm)] px-3 text-xs";


  function beginAction(action: "preview" | "download" | "spreadsheet") {
    setActiveAction(action);
    window.setTimeout(() => setActiveAction((current) => current === action ? null : current), 2200);
  }

  const busy = disabled || activeAction !== null;
  const previewIsPageAnchor = previewHref?.startsWith("#") ?? false;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onPreview ? (
        <button type="button" onClick={() => { beginAction("preview"); onPreview(); }} disabled={busy} aria-busy={activeAction === "preview"} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass}`}>
          {activeAction === "preview" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Printer aria-hidden="true" className="size-3.5" />}
          {activeAction === "preview" ? "Opening preview…" : previewLabel}
        </button>
      ) : previewHref ? (
        <Link href={previewHref} target={previewIsPageAnchor ? undefined : "_blank"} rel={previewIsPageAnchor ? undefined : "noopener noreferrer"} onClick={() => beginAction("preview")} aria-busy={activeAction === "preview"} className={`inline-flex items-center gap-1.5 bg-surface-muted font-medium text-foreground transition hover:bg-surface-elevated ${busy ? "pointer-events-none opacity-60" : ""} ${sizeClass}`}>
          {activeAction === "preview" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Printer aria-hidden="true" className="size-3.5" />}
          {activeAction === "preview" ? "Opening preview…" : previewLabel}
        </Link>
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
  );
}
