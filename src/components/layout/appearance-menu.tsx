"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Palette, Sun } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACCENT_KEY } from "@/components/layout/theme-provider";
import { cn } from "@/lib/utils";

export const ACCENTS = [
  { value: "emerald", label: "Emerald", from: "oklch(0.74 0.16 155)", to: "oklch(0.56 0.12 192)" },
  { value: "ocean", label: "Ocean", from: "oklch(0.7 0.14 220)", to: "oklch(0.55 0.18 258)" },
  { value: "royal", label: "Royal", from: "oklch(0.66 0.19 300)", to: "oklch(0.52 0.22 275)" },
  { value: "sunset", label: "Sunset", from: "oklch(0.8 0.16 70)", to: "oklch(0.63 0.2 35)" },
  { value: "rose", label: "Rose", from: "oklch(0.72 0.18 15)", to: "oklch(0.56 0.22 350)" },
  { value: "teal", label: "Teal", from: "oklch(0.72 0.12 185)", to: "oklch(0.52 0.11 215)" },
] as const;

const MODES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function subscribe(cb: () => void) {
  window.addEventListener(ACCENT_KEY, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ACCENT_KEY, cb);
    window.removeEventListener("storage", cb);
  };
}
function readAccent() {
  try {
    return localStorage.getItem(ACCENT_KEY) ?? "emerald";
  } catch {
    return "emerald";
  }
}

export function setAccent(value: string) {
  try {
    localStorage.setItem(ACCENT_KEY, value);
  } catch {}
  if (value === "emerald") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = value;
  window.dispatchEvent(new Event(ACCENT_KEY));
}

export function AppearanceMenu() {
  const { theme, setTheme } = useTheme();
  const accent = React.useSyncExternalStore(subscribe, readAccent, () => "emerald");
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Appearance"
          className="flex size-10 items-center justify-center rounded-full border border-surface-line/70 bg-surface/50 text-foreground/80 transition-all hover:bg-surface/90 hover:text-primary"
        >
          <Palette className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <p className="font-heading text-sm font-semibold">Appearance</p>
        <p className="mb-3 text-xs text-muted-foreground">Saved on this device</p>

        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Mode</p>
        <div className="grid grid-cols-3 gap-1 rounded-xl glass-subtle p-1">
          {MODES.map(({ value, label, icon: Icon }) => {
            const active = mounted && (theme ?? "light") === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium transition-all",
                  active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-[18px]", active && "text-primary")} />
                {label}
              </button>
            );
          })}
        </div>

        <p className="mt-4 mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Brand colour</p>
        <div className="grid grid-cols-3 gap-2">
          {ACCENTS.map((a) => {
            const active = accent === a.value;
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => setAccent(a.value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs transition-all",
                  active ? "border-primary/50 bg-accent text-foreground" : "border-transparent text-muted-foreground hover:bg-surface/60 hover:text-foreground",
                )}
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full text-white shadow-md ring-2 ring-surface-line/80"
                  style={{ backgroundImage: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                >
                  {active ? <Check className="size-4" weight="bold" /> : null}
                </span>
                {a.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
