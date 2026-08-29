"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";

export function ImportDropField({ inputId, label, helper, accept = ".csv,.xlsx,.xls" }: { inputId: string; label: string; helper: string; accept?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function assignFile(file: File) {
    if (!inputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setFileName(file.name);
  }

  return (
    <div
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) assignFile(file);
      }}
      className={[
        "relative flex min-h-32 flex-col items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-dashed px-4 text-center transition duration-[var(--motion-fast)]",
        dragging ? "border-brand bg-brand-soft/55" : "border-border bg-surface-muted hover:bg-brand-soft/40",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        id={inputId}
        name="file"
        type="file"
        accept={accept}
        className="sr-only"
        required
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
      />
      <label htmlFor={inputId} className="absolute inset-0 cursor-pointer" aria-label={label} />
      {dragging ? <UploadCloud className="size-6 text-brand" /> : <FileSpreadsheet className="size-6 text-brand" />}
      <span className="text-xs font-semibold">{fileName ?? label}</span>
      <span className="max-w-[18rem] text-[0.68rem] leading-5 text-muted-foreground">
        {fileName ? "Ready to stage. Drop another file here or click to replace it." : helper}
      </span>
      <span className="text-[0.65rem] font-medium text-brand-strong">Click to browse or drag & drop</span>
    </div>
  );
}
