"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export function ImportDropField({ inputId, label, helper, accept = ".csv,.xlsx,.xls" }: { inputId: string; label: string; helper: string; accept?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const { pending } = useFormStatus();

  function assignFile(file: File) {
    if (pending || !inputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setFileName(file.name);
  }

  return (
    <div
      aria-busy={pending}
      onDragEnter={(event) => { event.preventDefault(); if (!pending) setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); if (!pending) setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (pending) return;
        const file = event.dataTransfer.files?.[0];
        if (file) assignFile(file);
      }}
      className={[
        "relative flex min-h-32 flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-dashed px-4 text-center transition duration-[var(--motion-fast)]",
        pending ? "cursor-wait border-brand/40 bg-brand-soft/35" : dragging ? "border-brand bg-brand-soft/55" : "border-border bg-surface-muted hover:bg-brand-soft/40",
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
        aria-disabled={pending}
        onChange={(event) => {
          if (pending) return;
          setFileName(event.target.files?.[0]?.name ?? null);
        }}
      />
      {!pending ? <label htmlFor={inputId} className="absolute inset-0 cursor-pointer" aria-label={label} /> : null}
      {pending ? <Spinner className="size-6 text-brand" /> : dragging ? <UploadCloud className="size-6 text-brand" /> : <FileSpreadsheet className="size-6 text-brand" />}
      <span className="text-xs font-semibold">{pending ? "Uploading & staging…" : fileName ?? label}</span>
      <span className="max-w-[19rem] text-[0.68rem] leading-5 text-muted-foreground">
        {pending
          ? `${fileName ?? "Your file"} is being processed. Please wait and do not select or drop another file.`
          : fileName
            ? "Ready to stage. You can replace this file before starting the upload."
            : helper}
      </span>
      <span className="text-[0.65rem] font-medium text-brand-strong">
        {pending ? "Keep this page open until staging finishes" : "Click to browse or drag & drop"}
      </span>
      {pending ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-brand-soft"><span className="block h-full w-1/3 animate-pulse rounded-full bg-brand" /></span> : null}
    </div>
  );
}
