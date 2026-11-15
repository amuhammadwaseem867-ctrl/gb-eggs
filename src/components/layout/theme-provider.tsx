"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange storageKey="gb-theme">
      {children}
    </NextThemes>
  );
}

export const ACCENT_KEY = "gb-accent";
/** Runs before paint so the saved brand colour never flashes. */
export const accentScript = `try{var a=localStorage.getItem("${ACCENT_KEY}");if(a&&a!=="emerald")document.documentElement.dataset.accent=a}catch(e){}`;
