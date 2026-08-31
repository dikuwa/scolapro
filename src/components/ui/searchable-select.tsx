"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  helper?: string;
  group?: string;
  searchText?: string;
};

const ROW_HEIGHT = 48;
const OVERSCAN = 8;
const VIEWPORT_HEIGHT = 288;

function highlightMatch(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <strong>{text.slice(index, index + needle.length)}</strong>
      {text.slice(index + needle.length)}
    </>
  );
}

export function SearchableSelect({
  label,
  ariaLabel,
  name,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search…",
  emptyMessage,
  disabled = false,
  className,
}: {
  label?: string;
  ariaLabel?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: (query: string) => string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const source = needle
      ? options.filter((option) => `${option.label} ${option.helper ?? ""} ${option.group ?? ""} ${option.searchText ?? ""}`.toLocaleLowerCase().includes(needle))
      : options;
    return [...source].sort((a, b) => {
      const groupCompare = (a.group ?? "").localeCompare(b.group ?? "", undefined, { numeric: true });
      if (groupCompare) return groupCompare;
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  }, [options, query]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(filtered.length, startIndex + visibleCount);
  const visibleOptions = filtered.slice(startIndex, endIndex);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const selectedIndex = options.findIndex((option) => option.value === value);
    setQuery("");
    setActiveIndex(Math.max(0, selectedIndex));
    setScrollTop(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function updateQuery(next: string) {
    setQuery(next);
    setActiveIndex(0);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  function choose(option: SearchableSelectOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (!filtered.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.max(0, Math.min(filtered.length - 1, activeIndex + delta));
      setActiveIndex(next);
      const top = next * ROW_HEIGHT;
      const bottom = top + ROW_HEIGHT;
      if (listRef.current) {
        if (top < listRef.current.scrollTop) listRef.current.scrollTop = top;
        else if (bottom > listRef.current.scrollTop + VIEWPORT_HEIGHT) listRef.current.scrollTop = bottom - VIEWPORT_HEIGHT;
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) choose(option);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative flex min-w-0 flex-col", label ? "gap-1.5" : "", className)}>
      {label ? <label className="text-xs font-medium leading-4">{label}</label> : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={openMenu}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || label || placeholder}
        className="scolapro-control-surface flex min-h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 text-left text-sm outline-none transition duration-[var(--motion-fast)] hover:border-border focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className={cn("min-w-0 truncate", selected ? "text-foreground" : "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-[90] mt-1 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]">
          <label className="scolapro-control-surface flex min-h-9 items-center gap-2 rounded-[var(--radius-xs)] px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input ref={inputRef} value={query} onChange={(event) => updateQuery(event.target.value)} onKeyDown={onKeyDown} placeholder={searchPlaceholder} autoComplete="off" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />
            {query ? <button type="button" onClick={() => updateQuery("")} aria-label="Clear search" className="grid size-6 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted"><X className="size-3" /></button> : null}
          </label>

          {filtered.length ? (
            <div ref={listRef} role="listbox" aria-label={ariaLabel || label || placeholder} className="relative mt-1 overflow-y-auto rounded-[var(--radius-xs)]" style={{ height: Math.min(VIEWPORT_HEIGHT, filtered.length * ROW_HEIGHT) }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
              <div style={{ height: filtered.length * ROW_HEIGHT, position: "relative" }}>
                {visibleOptions.map((option, offset) => {
                  const index = startIndex + offset;
                  const previous = filtered[index - 1];
                  const showGroup = Boolean(option.group) && option.group !== previous?.group;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(option)}
                      className={cn("absolute left-0 right-0 flex h-12 items-center gap-2 rounded-[var(--radius-xs)] px-2.5 text-left transition", activeIndex === index ? "bg-surface-muted" : "hover:bg-surface-muted/75", option.value === value && "text-brand-strong")}
                      style={{ top: index * ROW_HEIGHT }}
                    >
                      <span className="min-w-0 flex-1">
                        {showGroup ? <span className="mb-0.5 block truncate text-[0.58rem] font-semibold uppercase tracking-wide text-muted-foreground">{option.group}</span> : null}
                        <span className="block truncate text-sm font-medium">{highlightMatch(option.label, query)}</span>
                        {!showGroup && option.helper ? <span className="block truncate text-[0.64rem] text-muted-foreground">{highlightMatch(option.helper, query)}</span> : null}
                      </span>
                      {option.value === value ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">{emptyMessage ? emptyMessage(query) : `No result found for '${query}'.`}</p>}
        </div>
      ) : null}
    </div>
  );
}
