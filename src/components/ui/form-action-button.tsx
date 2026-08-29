"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "warning";
};

export function FormActionButton({ children, pendingLabel, className, confirm, disabled = false }: { children: ReactNode; pendingLabel?: string; className?: string; confirm?: ConfirmOptions; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => cancelRef.current?.focus());
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen]);

  const content = pending ? <><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />{pendingLabel ?? "Working…"}</> : children;

  if (!confirm) {
    return <button type="submit" disabled={disabled || pending} className={cn("inline-flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-65", className)}>{content}</button>;
  }

  const tone = confirm.tone ?? "danger";
  return (
    <>
      <button type="button" disabled={disabled || pending} onClick={() => setConfirmOpen(true)} className={cn("inline-flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-65", className)}>{content}</button>
      <button ref={submitRef} type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">{confirm.confirmLabel ?? "Confirm"}</button>
      {confirmOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[700] grid place-items-center bg-black/35 px-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmOpen(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description" className="w-full max-w-md rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 shadow-[var(--shadow-lg)]">
            <div className={cn("grid size-10 place-items-center rounded-full", tone === "danger" ? "bg-danger-soft text-[color:var(--danger)]" : "bg-warning-soft text-[color:var(--warning)]")}><AlertTriangle className="size-5" aria-hidden="true" /></div>
            <h2 id="confirm-action-title" className="mt-4 text-base font-semibold tracking-[-0.015em] text-foreground">{confirm.title}</h2>
            <p id="confirm-action-description" className="mt-1.5 text-sm leading-6 text-muted-foreground">{confirm.description}</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button ref={cancelRef} type="button" onClick={() => setConfirmOpen(false)} className="min-h-9 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">Keep it</button>
              <button type="button" onClick={() => { setConfirmOpen(false); submitRef.current?.form?.requestSubmit(submitRef.current); }} className={cn("min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-semibold text-white transition focus-visible:outline-none focus-visible:ring-4", tone === "danger" ? "bg-[color:var(--danger)] hover:brightness-95 focus-visible:ring-[color:var(--danger)]/20" : "bg-[color:var(--warning)] hover:brightness-95 focus-visible:ring-[color:var(--warning)]/20")}>{confirm.confirmLabel ?? "Confirm"}</button>
            </div>
          </div>
        </div>, document.body) : null}
    </>
  );
}
