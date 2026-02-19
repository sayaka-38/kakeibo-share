"use client";

import { useState, useEffect } from "react";
import { useTheme, type ThemeId } from "@/lib/theme";
import { t } from "@/lib/i18n";

type PaletteOption = {
  id: ThemeId;
  label: string;
  bg: string;
  primary: string;
  text: string;
};

const palettes: PaletteOption[] = [
  { id: "14", label: "Steel",    bg: "#f1f5f9", primary: "#3b82f6", text: "#0f172a" },
  { id: "12", label: "Midnight", bg: "#0d1117", primary: "#58a6ff", text: "#e6edf3" },
  { id: "15", label: "Forest",   bg: "#f0fdf4", primary: "#16a34a", text: "#052e16" },
  { id: "16", label: "Studio",   bg: "#18181b", primary: "#818cf8", text: "#fafafa" },
  { id: "17", label: "Slate",    bg: "#f8fafc", primary: "#6366f1", text: "#1e293b" },
];

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- hydration guard pattern
  }, []);

  // SSR / 初回レンダリング時はプレースホルダーを表示し、Hydration Error を防止
  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-theme-muted hidden sm:inline">
          {t("theme.label")}
        </span>
        <div className="flex gap-1.5">
          {palettes.map((p) => (
            <div
              key={p.id}
              className="w-6 h-6 rounded-full border-2 border-transparent"
              style={{
                background: `linear-gradient(135deg, ${p.bg} 50%, ${p.primary} 50%)`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-theme-muted hidden sm:inline">
        {t("theme.label")}
      </span>
      <div className="flex gap-1.5">
        {palettes.map((p) => (
          <button
            key={p.id}
            onClick={() => setTheme(p.id)}
            aria-label={p.label}
            title={p.label}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${
              theme === p.id
                ? "border-theme-headline scale-110"
                : "border-transparent hover:scale-105"
            }`}
            style={{
              background: `linear-gradient(135deg, ${p.bg} 50%, ${p.primary} 50%)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
