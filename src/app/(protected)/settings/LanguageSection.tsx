"use client";

import { t, useLocale, type Locale } from "@/lib/i18n";

export function LanguageSection() {
  const { locale, setLocale } = useLocale();

  return (
    <section className="bg-theme-card-bg rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-theme-headline mb-2">
        {t("settings.language.title")}
      </h2>
      <p className="text-sm text-theme-muted mb-4">
        {t("settings.language.description")}
      </p>
      <div className="flex gap-3">
        {(["ja", "en"] as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              locale === l
                ? "bg-theme-primary text-white"
                : "bg-theme-bg border border-theme-card-border text-theme-text hover:bg-theme-primary/10"
            }`}
          >
            {l === "ja" ? "日本語" : "English"}
          </button>
        ))}
      </div>
    </section>
  );
}
