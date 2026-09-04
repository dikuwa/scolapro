"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerOption = { value: string; label: string; helper?: string };

export function Picker({
  label,
  ariaLabel,
  name,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search options",
  className,
}: {
  label?: string;
  ariaLabel?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = searchable && normalizedQuery
    ? options.filter((option) => `${option.label} ${option.helper ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
    : options;

  const closePicker = () => {
    setOpen(false);
    setQuery("");
  };

  function openPicker(initialQuery = "") {
    setQuery(initialQuery);
    setOpen(true);
    if (searchable) requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      if (!open) {
        event.preventDefault();
        openPicker();
      }
      return;
    }
    if (!searchable || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    event.preventDefault();
    openPicker(event.key);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePicker();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      {label ? <label className="block text-xs font-medium leading-4">{label}</label> : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) closePicker();
          else openPicker();
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || label || placeholder}
        className={cn(
          "flex min-h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-fast)] hover:border-border focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-55",
          label && "mt-1.5",
        )}
      >
        <span className={cn("min-w-0 truncate", selected ? "text-foreground" : "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        {searchable ? <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]", open && "rotate-180")} aria-hidden="true" />}
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-sm)]">
          {searchable ? (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="min-h-9 w-full rounded-[var(--radius-xs)] border border-border-subtle bg-surface-muted pl-8 pr-2.5 text-sm outline-none transition duration-[var(--motion-fast)] placeholder:text-muted-foreground/70 focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]"
              />
            </div>
          ) : null}
          <div role="listbox" className="max-h-60 overflow-auto">
            {filteredOptions.length ? filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => { onChange(option.value); closePicker(); }}
                className={cn("w-full rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none", option.value === value && "bg-brand-soft text-brand-strong")}
              >
                <span className="block truncate text-sm font-medium">{option.label}</span>
                {option.helper ? <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">{option.helper}</span> : null}
              </button>
            )) : <p className="px-2.5 py-3 text-xs text-muted-foreground">{options.length ? "No matching options." : "No options available yet."}</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

export function TimePicker({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  const [hour = "", minute = ""] = value.split(":");
  return (
    <div className="min-w-0">
      <input type="hidden" name={name} value={value} />
      <p className="mb-1.5 text-xs font-medium leading-4">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Picker label="Hour" name={`${name}-hour-ui`} value={hour} onChange={(next) => onChange(`${next}:${minute || "00"}`)} placeholder="Hour" options={hours.map((item) => ({ value: item, label: item }))} />
        <Picker label="Minute" name={`${name}-minute-ui`} value={minute} onChange={(next) => onChange(`${hour || "00"}:${next}`)} placeholder="Min" options={minutes.map((item) => ({ value: item, label: item }))} />
      </div>
    </div>
  );
}
