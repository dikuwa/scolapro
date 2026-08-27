"use client";

import { AlertTriangle, CheckCircle2, Info, LoaderCircle, XCircle } from "lucide-react";
import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      richColors={false}
      icons={{
        success: <CheckCircle2 aria-hidden="true" className="size-4 text-[color:var(--success)]" />,
        error: <XCircle aria-hidden="true" className="size-4 text-[color:var(--danger)]" />,
        warning: <AlertTriangle aria-hidden="true" className="size-4 text-[color:var(--warning)]" />,
        info: <Info aria-hidden="true" className="size-4 text-[color:var(--info)]" />,
        loading: <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-[color:var(--brand)]" />,
      }}
      toastOptions={{
        duration: 3800,
        classNames: {
          toast:
            "scolapro-toast !rounded-[var(--radius-sm)] !border !border-[color:var(--border-subtle)] !bg-[color:var(--surface-elevated)] !text-[color:var(--foreground)] !shadow-[var(--shadow-sm)]",
          description: "!text-[color:var(--muted-foreground)]",
          actionButton: "!rounded-[var(--radius-sm)] !bg-[color:var(--brand)] !text-white",
          cancelButton: "!rounded-[var(--radius-sm)] !bg-[color:var(--surface-muted)] !text-[color:var(--foreground)]",
          closeButton:
            "!border-[color:var(--border-subtle)] !bg-[color:var(--surface-elevated)] !text-[color:var(--muted-foreground)] !shadow-[var(--shadow-xs)]",
        },
      }}
    />
  );
}