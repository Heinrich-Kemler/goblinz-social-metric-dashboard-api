"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "goblinz-theme";

type Theme = "neutral" | "brand";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("neutral");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme: Theme = stored === "brand" ? "brand" : "neutral";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const applyTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-2 text-xs text-slate shadow-sm">
      <span className="muted hidden text-[0.6rem] uppercase tracking-[0.3em] sm:inline">
        Theme
      </span>
      <button
        type="button"
        onClick={() => applyTheme("neutral")}
        aria-pressed={theme === "neutral"}
        className={
          theme === "neutral"
            ? "rounded-full bg-ink px-3 py-1 text-white"
            : "rounded-full px-3 py-1 text-slate hover:bg-slate-100"
        }
      >
        Neutral
      </button>
      <button
        type="button"
        onClick={() => applyTheme("brand")}
        aria-pressed={theme === "brand"}
        className={
          theme === "brand"
            ? "rounded-full bg-ink px-3 py-1 text-white"
            : "rounded-full px-3 py-1 text-slate hover:bg-slate-100"
        }
      >
        Accent
      </button>
    </div>
  );
}
