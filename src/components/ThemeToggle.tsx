"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "goblinz-theme";

type Theme = "neutral" | "brand" | "crazy";

const THEMES: Array<{ key: Theme; label: string }> = [
  { key: "neutral", label: "Neutral" },
  { key: "brand", label: "Accent" },
  { key: "crazy", label: "Crazy" }
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("neutral");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme: Theme =
      stored === "brand" || stored === "crazy" ? stored : "neutral";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const applyTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-2 text-xs text-slate shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur">
      <span className="muted hidden text-[0.58rem] uppercase tracking-[0.28em] sm:inline">
        Theme
      </span>
      {THEMES.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => applyTheme(item.key)}
          aria-pressed={theme === item.key}
          className={
            theme === item.key
              ? "rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-3 py-1 font-semibold text-white shadow-[0_8px_18px_var(--accent-glow)]"
              : "rounded-full px-3 py-1 text-slate transition hover:bg-slate-100"
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
