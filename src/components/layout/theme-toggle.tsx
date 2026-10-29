"use client";

import { useState, useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { setThemeAction } from "@/app/actions/preferences";
import type { Theme } from "@/i18n/config";

export function ThemeToggle({
  initial,
  labelToDark,
  labelToLight,
}: {
  initial: Theme;
  labelToDark: string;
  labelToLight: string;
}) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [, startTransition] = useTransition();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? labelToDark : labelToLight;

  function toggle() {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    startTransition(async () => {
      await setThemeAction(next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-[5px] border border-line text-muted transition-colors hover:bg-raised hover:text-text"
    >
      {theme === "dark" ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
    </button>
  );
}
