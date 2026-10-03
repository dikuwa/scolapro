"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "scolapro-theme";
const THEME_CHANGE_EVENT = "scolapro-theme-change";

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
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

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") {
    delete root.dataset.theme;
    root.style.removeProperty("color-scheme");
    return;
  }
  root.dataset.theme = preference;
  root.style.colorScheme = preference;
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

export function ThemePreferenceControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    storedThemePreference,
    () => "system",
  );

  function choose(next: ThemePreference) {
    applyThemePreference(next);
    persistThemePreference(next);
    window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: next }));
  }

  return (
    <div>
      {!compact ? (
        <div className="mb-3">
          <h2 className="scolapro-section-title">Appearance</h2>
          <p className="scolapro-section-description">Use your device theme automatically, or keep ScolaPro in Light or Dark mode on this browser.</p>
        </div>
      ) : (
        <p className="mb-1.5 px-1 text-[0.68rem] font-medium text-muted-foreground">Appearance</p>
      )}
      <div
        role="group"
        aria-label="Appearance theme"
        className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const selected = preference === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={selected ? "soft" : "ghost"}
              aria-pressed={selected}
              onClick={() => choose(option.value)}
              className={compact ? "min-w-0 px-2 text-[0.68rem]" : "min-w-0"}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{compact && option.value === "system" ? "Auto" : option.label}</span>
            </Button>
          );
        })}
      </div>
      {!compact ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">System is the default. Your selection is stored only on this browser/device and does not change school data.</p>
      ) : null}
    </div>
  );
}

export function AppearanceSettings() {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <ThemePreferenceControl />
    </section>
  );
}
