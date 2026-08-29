"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { LoaderCircle } from "lucide-react";

type PendingAction = { path: string; label: string } | null;

export function ImportActivityGuard() {
  const pathname = usePathname();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    if (pathname !== "/school/imports") return;

    function handleSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const submitter = event.submitter;
      const label = submitter instanceof HTMLElement
        ? submitter.textContent?.trim()
        : null;
      setPendingAction({ path: pathname, label: label || "Processing import" });
    }

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, [pathname]);

  if (
    typeof document === "undefined"
    || pathname !== "/school/imports"
    || pendingAction?.path !== pathname
  ) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] grid place-items-center bg-[color:var(--background)]/55 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 text-center shadow-[var(--shadow-md)]">
        <LoaderCircle aria-hidden="true" className="mx-auto size-6 animate-spin text-brand" />
        <p className="mt-3 text-sm font-semibold text-foreground">{pendingAction.label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Please keep this page open. ScolaPro is processing the file and updating the import workflow.
        </p>
      </div>
    </div>,
    document.body,
  );
}
