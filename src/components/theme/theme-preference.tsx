"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ThemeMenuVariant = "icon" | "account" | "settings";

export const THEME_STORAGE_KEY = "scolapro-theme";
export const THEME_CHANGE_EVENT = "scolapro-theme-change";
export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
const LIGHT_FAVICON = "/brand/scolapro/icon-blue.svg";
const DARK_FAVICON = "/brand/scolapro/icon-white.svg";

const options: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "System", description: "Follow this device", icon: Monitor },
  { value: "light", label: "Light", description: "Always use light", icon: Sun },
  { value: "dark", label: "Dark", description: "Always use dark", icon: Moon },
];

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function storedThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function systemDarkSnapshot() {
  return window.matchMedia(SYSTEM_DARK_QUERY).matches;
}

function syncThemeFavicon(preference: ThemePreference) {
  const systemDark = window.matchMedia(SYSTEM_DARK_QUERY).matches;
  const effectiveDark = preference === "dark" || (preference === "system" && systemDark);
  const href = effectiveDark ? DARK_FAVICON : LIGHT_FAVICON;
  for (const id of ["scolapro-favicon", "scolapro-shortcut-icon"]) {
    document.getElementById(id)?.setAttribute("href", href);
  }
}

function subscribeSystemTheme(onStoreChange: () => void) {
  const query = window.matchMedia(SYSTEM_DARK_QUERY);
  const onChange = () => {
    const preference = storedThemePreference();
    if (preference === "system") syncThemeFavicon(preference);
    onStoreChange();
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") {
    delete root.dataset.theme;
    root.style.removeProperty("color-scheme");
  } else {
    root.dataset.theme = preference;
    root.style.colorScheme = preference;
  }
  syncThemeFavicon(preference);
}

function persistThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this page if storage is unavailable.
  }
}

function subscribeThemePreference(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyThemePreference(storedThemePreference());
    onStoreChange();
  };
  const onThemeChange = () => onStoreChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  };
}

export function ThemeMenu({
  variant = "icon",
  align = "right",
}: {
  variant?: ThemeMenuVariant;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    storedThemePreference,
    () => "system",
  );
  const systemDark = useSyncExternalStore(
    subscribeSystemTheme,
    systemDarkSnapshot,
    () => false,
  );
  const effectiveDark = preference === "dark" || (preference === "system" && systemDark);
  const TriggerIcon = effectiveDark ? Moon : Sun;

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

  function choose(next: ThemePreference) {
    applyThemePreference(next);
    persistThemePreference(next);
    window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: next }));
    setOpen(false);
  }

  const triggerClass = variant === "icon"
    ? "grid size-9 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:bg-surface-muted focus-visible:text-foreground"
    : variant === "account"
      ? "flex min-h-9 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-left text-xs font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
      : "flex min-h-10 w-full max-w-sm items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-sm text-foreground shadow-[var(--shadow-xs)] transition hover:bg-surface-muted";

  const panelClass = variant === "account"
    ? "mt-1"
    : `absolute top-full z-[220] mt-2 w-52 ${align === "right" ? "right-0" : "left-0"}`;

  return (
    <div ref={rootRef} className={variant === "settings" ? "relative mt-4 w-full max-w-sm" : "relative"}>
      <button
        type="button"
        role={variant === "account" ? "menuitem" : undefined}
        aria-label={variant === "icon" ? `Appearance: ${preference}. Change theme` : undefined}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={triggerClass}
      >
        <TriggerIcon className="size-[1.05rem] shrink-0" aria-hidden="true" />
        {variant !== "icon" ? (
          <>
            <span className="flex-1">{variant === "account" ? "Appearance" : "Theme"}</span>
            <span className="text-[0.68rem] font-normal text-muted-foreground">{preference === "system" ? "System" : preference === "light" ? "Light" : "Dark"}</span>
          </>
        ) : null}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Choose appearance"
          className={`${panelClass} rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]`}
        >
          {options.map((option) => {
            const Icon = option.icon;
            const selected = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => choose(option.value)}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-left transition hover:bg-surface-muted focus-visible:bg-surface-muted ${selected ? "bg-brand-soft text-brand-strong" : "text-foreground"}`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-surface-muted">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{option.label}</span>
                  <span className="block truncate text-[0.68rem] font-normal text-muted-foreground">{option.description}</span>
                </span>
                <span className="grid size-5 shrink-0 place-items-center">
                  {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PublicThemeMenu() {
  return (
    <div className="scolapro-public-theme-launcher fixed right-4 top-4 z-[210] rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-sm)] sm:right-5 sm:top-5">
      <ThemeMenu variant="icon" />
    </div>
  );
}

export function AppearanceSettings() {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Appearance</h2>
      <p className="scolapro-section-description">Use your device theme automatically, or keep ScolaPro in Light or Dark mode on this browser.</p>
      <ThemeMenu variant="settings" align="left" />
      <p className="mt-3 text-xs leading-5 text-muted-foreground">System is the default. Your selection is stored only on this browser/device and does not change school data.</p>
    </section>
  );
}
