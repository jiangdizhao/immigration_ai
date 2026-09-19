"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getSiteTranslation,
  normalizeSiteLocale,
  type SiteLocale,
  type SiteTranslation,
  serializeSiteLocaleCookie,
} from "@/lib/site-locale";

type SiteLocaleContextValue = {
  locale: SiteLocale;
  copy: SiteTranslation;
  setLocale: (locale: SiteLocale) => void;
};

const SiteLocaleContext = createContext<SiteLocaleContextValue | null>(null);

export function SiteLocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: SiteLocale;
}) {
  const [locale, setLocaleState] = useState(() =>
    normalizeSiteLocale(initialLocale)
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: SiteLocale) => {
    const normalizedLocale = normalizeSiteLocale(nextLocale);
    setLocaleState(normalizedLocale);
    // biome-ignore lint/suspicious/noDocumentCookie: the locale cookie is intentionally client-persisted.
    document.cookie = serializeSiteLocaleCookie(normalizedLocale);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      copy: getSiteTranslation(locale),
      setLocale,
    }),
    [locale, setLocale]
  );

  return (
    <SiteLocaleContext.Provider value={value}>
      {children}
    </SiteLocaleContext.Provider>
  );
}

export function useSiteLocale() {
  const context = useContext(SiteLocaleContext);
  if (!context) {
    throw new Error("useSiteLocale must be used within SiteLocaleProvider");
  }
  return context;
}
