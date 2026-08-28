"use client";

import Link from "next/link";
import { KeyRound, LogOut, Settings, UserRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "@/features/auth/actions";

export function AccountMenu({
  avatar,
  displayName,
  roleLabel,
  compact = false,
}: {
  avatar: React.ReactNode;
  displayName: string;
  roleLabel: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        className={`flex min-w-0 items-center rounded-[var(--radius-sm)] transition hover:bg-surface-muted focus-visible:bg-surface-muted ${compact ? "w-full gap-2 px-2 py-2 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-1" : "gap-2 px-1.5 py-1"}`}
      >
        {avatar}
        <span className={compact ? "min-w-0 text-left group-data-[collapsed=true]/sidebar:hidden" : "hidden min-w-0 text-left sm:block"}>
          <span className="block max-w-40 truncate text-xs font-medium text-foreground">{displayName}</span>
          {compact ? <span className="block truncate text-[0.68rem] capitalize text-muted-foreground">{roleLabel}</span> : null}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account actions"
          className={`absolute z-[150] w-56 overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)] ${compact ? "bottom-full left-0 mb-2 group-data-[collapsed=true]/sidebar:left-full group-data-[collapsed=true]/sidebar:bottom-0 group-data-[collapsed=true]/sidebar:mb-0 group-data-[collapsed=true]/sidebar:ml-2" : "right-0 top-full mt-2"}`}
        >
          <div className="flex items-start gap-2 border-b border-border-subtle px-2.5 py-2.5">
            <span className="mt-0.5 text-brand"><UserRound className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">{displayName}</p>
              <p className="mt-0.5 truncate text-[0.68rem] capitalize text-muted-foreground">{roleLabel}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close account menu" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted"><X className="size-3.5" /></button>
          </div>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="mt-1 flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground">
            <Settings className="size-4" aria-hidden="true" />Account settings
          </Link>
          <Link role="menuitem" href="/settings#security" onClick={() => setOpen(false)} className="flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground">
            <KeyRound className="size-4" aria-hidden="true" />Password & security
          </Link>
          <form action={signOut}>
            <button role="menuitem" type="submit" className="flex min-h-9 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-danger-soft hover:text-[color:var(--danger)]">
              <LogOut className="size-4" aria-hidden="true" />Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
