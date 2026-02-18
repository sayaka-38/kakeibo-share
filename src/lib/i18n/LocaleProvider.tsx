"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  getStoredLocale,
  setCurrentLocale,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "./index";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = getStoredLocale();
    setCurrentLocale(stored); // sync module variable on init
    return stored;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setCurrentLocale(newLocale);
    document.documentElement.lang = newLocale;
    // Persist to cookie (365 days)
    document.cookie = `${LOCALE_COOKIE_KEY}=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <div key={locale}>{children}</div>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}
