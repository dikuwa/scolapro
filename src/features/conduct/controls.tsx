"use client";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ConductActionState } from "./types";

export const fieldClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition-colors duration-[var(--motion-fast)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-55";

const PendingContext = createContext(false);

/** True while the enclosing ConductForm is saving, so submit actions can disable and show a spinner. */
export function useConductFormPending() {
  return useContext(PendingContext);
}

export function ConductForm({ action, children, onSaved }: { action: (state: ConductActionState, data: FormData) => Promise<ConductActionState>; children: ReactNode; onSaved?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (event.currentTarget.querySelector('[aria-invalid="true"]')) { setMessage("Correct the highlighted fields before saving."); return; }
    if (!navigator.onLine) { setMessage("You are offline. Keep this form open and reconnect before saving."); return; }
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await action({}, data);
        setMessage(result.message ?? "");
        if (result.success) { toast.success(result.message); onSaved?.(); }
      } catch { setMessage("The save could not be confirmed. Your entries remain here; check the history before retrying."); }
    });
  }
  return (
    <PendingContext.Provider value={pending}>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>
        {message ? <p role="status" className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 text-sm leading-5 text-muted-foreground">{message}</p> : null}
      </form>
    </PendingContext.Provider>
  );
}

export function ConductDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  const close = () => { if (!ref.current?.querySelector("fieldset[disabled]")) onClose(); };
  return (
    <dialog
      ref={ref}
      onCancel={event => { event.preventDefault(); close(); }}
      aria-labelledby="conduct-dialog-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 text-foreground shadow-[var(--shadow-sm)] backdrop:bg-background/80 sm:max-h-[85dvh] sm:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <h2 id="conduct-dialog-title" className="scolapro-section-title">{title}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={close} aria-label="Close form">Close</Button>
      </div>
      {children}
    </dialog>
  );
}
