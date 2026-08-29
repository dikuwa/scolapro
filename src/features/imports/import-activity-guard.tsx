"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";

type ActionTone = "brand" | "success" | "warning" | "danger";
type PendingAction = { navigationKey: string; label: string; tone: ActionTone } | null;

const toneClasses: Record<ActionTone, { spinner: string; title: string }> = {
  brand: { spinner: "text-brand", title: "text-brand-strong" },
  success: { spinner: "text-[color:var(--success)]", title: "text-[color:var(--success)]" },
  warning: { spinner: "text-[color:var(--warning)]", title: "text-[color:var(--warning)]" },
  danger: { spinner: "text-[color:var(--danger)]", title: "text-[color:var(--danger)]" },
};

function toneForAction(label: string): ActionTone {
  const value = label.toLowerCase();
  if (/cancel|discard|delete|remove|reject/.test(value)) return "danger";
  if (/archive/.test(value)) return "warning";
  if (/commit|complete|approve|publish|finish/.test(value)) return "success";
  return "brand";
}

export function ImportActivityGuard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationKey = useMemo(
    () => `${pathname}?${searchParams.toString()}`,
    [pathname, searchParams],
  );
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
      const resolvedLabel = label || "Processing import";
      setPendingAction({
        navigationKey,
        label: resolvedLabel,
        tone: toneForAction(resolvedLabel),
      });
    }

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, [navigationKey, pathname]);

  useEffect(() => {
    function clearOnPageRestore() {
      setPendingAction(null);
    }
    window.addEventListener("pageshow", clearOnPageRestore);
    return () => window.removeEventListener("pageshow", clearOnPageRestore);
  }, []);

  if (
    typeof document === "undefined"
    || pathname !== "/school/imports"
    || !pendingAction
    || pendingAction.navigationKey !== navigationKey
  ) return null;

  const tone = toneClasses[pendingAction.tone];

  return createPortal(
    <div
      className="fixed inset-0 z-[500] grid place-items-center bg-[color:var(--background)]/55 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 text-center shadow-[var(--shadow-md)]">
        <LoaderCircle aria-hidden="true" className={`mx-auto size-6 animate-spin ${tone.spinner}`} />
        <p className={`mt-3 text-sm font-semibold ${tone.title}`}>{pendingAction.label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Please keep this page open. ScolaPro is processing the action and updating the import workflow.
        </p>
      </div>
    </div>,
    document.body,
  );
}
