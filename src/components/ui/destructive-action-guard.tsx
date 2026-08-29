"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

type PendingConfirmation = {
  form: HTMLFormElement;
  submitter: HTMLElement | null;
  action: string;
} | null;

const destructivePattern = /\b(delete|remove|discard|revoke|archive|cancel|withdraw|deactivate|reject)\b/i;
const confirmedForms = new WeakSet<HTMLFormElement>();

function actionLabel(submitter: HTMLElement | null, form: HTMLFormElement) {
  return submitter?.getAttribute("data-confirm-label")
    || submitter?.textContent?.trim()
    || form.getAttribute("data-confirm-label")
    || "this action";
}

export function DestructiveActionGuard() {
  const [pending, setPending] = useState<PendingConfirmation>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (confirmedForms.has(form)) {
        confirmedForms.delete(form);
        return;
      }

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      const explicit = submitter?.getAttribute("data-confirm-destructive") === "true" || form.getAttribute("data-confirm-destructive") === "true";
      const label = actionLabel(submitter, form);
      if (!explicit && !destructivePattern.test(label)) return;

      event.preventDefault();
      event.stopPropagation();
      setPending({ form, submitter, action: label });
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPending(null); };
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => cancelRef.current?.focus());
    return () => document.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending || typeof document === "undefined") return null;

  const readableAction = pending.action.replace(/\s+/g, " ").trim();
  return createPortal(
    <div className="fixed inset-0 z-[750] grid place-items-center bg-black/35 px-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setPending(null); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="destructive-confirm-title" aria-describedby="destructive-confirm-description" className="w-full max-w-md rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 shadow-[var(--shadow-lg)]">
        <div className="grid size-10 place-items-center rounded-full bg-danger-soft text-[color:var(--danger)]"><AlertTriangle aria-hidden="true" className="size-5" /></div>
        <h2 id="destructive-confirm-title" className="mt-4 text-base font-semibold tracking-[-0.015em] text-foreground">Confirm destructive action</h2>
        <p id="destructive-confirm-description" className="mt-1.5 text-sm leading-6 text-muted-foreground">You are about to <span className="font-semibold text-foreground">{readableAction.toLowerCase()}</span>. This can change or hide school records and may not be reversible. Confirm only if this is intentional.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={() => setPending(null)} className="min-h-9 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">Keep current record</button>
          <button type="button" onClick={() => {
            const { form, submitter } = pending;
            setPending(null);
            confirmedForms.add(form);
            if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) form.requestSubmit(submitter);
            else form.requestSubmit();
          }} className="min-h-9 rounded-[var(--radius-sm)] bg-[color:var(--danger)] px-3 text-xs font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--danger)]/20">Yes, continue</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
