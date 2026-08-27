"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      richColors={false}
      toastOptions={{
        duration: 3800,
        classNames: {
          toast:
            "!rounded-xl !border !border-[color:var(--border)] !bg-[color:var(--surface-elevated)] !text-[color:var(--foreground)] !shadow-[var(--shadow-md)]",
          description: "!text-[color:var(--muted-foreground)]",
          actionButton: "!rounded-lg !bg-[color:var(--brand)] !text-white",
          cancelButton: "!rounded-lg !bg-[color:var(--surface-muted)] !text-[color:var(--foreground)]",
        },
      }}
    />
  );
}
