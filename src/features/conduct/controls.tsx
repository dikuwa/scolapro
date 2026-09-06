"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import type { ConductActionState } from "./types";

export const fieldClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand";
export const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

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
  return <form onSubmit={submit} className="space-y-4"><fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>{pending ? <p className="flex items-center gap-2 text-sm" role="status"><Spinner />Saving…</p> : null}{message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}</form>;
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
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="conduct-dialog-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 text-foreground shadow-[var(--shadow-sm)] backdrop:bg-background/80"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="conduct-dialog-title" className="scolapro-section-title">{title}</h2><button type="button" className={buttonClass} onClick={close} aria-label="Close form">Close</button></div>{children}</dialog>;
}
