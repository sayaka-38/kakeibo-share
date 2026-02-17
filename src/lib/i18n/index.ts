import ja from "@/locales/ja.json";
import en from "@/locales/en.json";

export type Locale = "ja" | "en";

const locales = {
  ja,
  en,
} as const;

const VALID_LOCALES: Locale[] = ["ja", "en"];

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "ja";
  try {
    const match = document.cookie.match(/kakeibo-locale=(ja|en)/);
    if (match) return match[1] as Locale;
    const stored = localStorage.getItem("kakeibo-locale");
    if (stored && VALID_LOCALES.includes(stored as Locale)) return stored as Locale;
  } catch {
    // SSR or privacy mode
  }
  return "ja";
}

// Mutable current locale — updated by LocaleProvider
let currentLocale: Locale = getStoredLocale();

export function setCurrentLocale(locale: Locale) {
  currentLocale = locale;
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}

/**
 * Get a nested value from an object using dot notation
 * @param obj - The object to traverse
 * @param path - Dot-separated path (e.g., "auth.login.title")
 * @returns The value at the path or undefined
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Get a translation by key
 * @param key - Dot-separated key (e.g., "auth.login.title")
 * @param params - Optional parameters for interpolation (e.g., { count: 5 })
 * @returns The translated string or the key if not found
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const translations = locales[currentLocale];
  const value = getNestedValue(translations as unknown as Record<string, unknown>, key);

  if (typeof value !== "string") {
    console.warn(`Translation key not found: ${key}`);
    return key;
  }

  if (!params) {
    return value;
  }

  // Replace {paramName} with the actual value
  return value.replace(/\{(\w+)\}/g, (_, paramKey) => {
    const paramValue = params[paramKey];
    return paramValue !== undefined ? String(paramValue) : `{${paramKey}}`;
  });
}

// Type-safe keys (for IDE autocomplete)
export type TranslationKeys = typeof ja;

// Export locales for direct access if needed
export { ja, en };

// Re-export LocaleProvider and useLocale
export { LocaleProvider, useLocale } from "./LocaleProvider";
