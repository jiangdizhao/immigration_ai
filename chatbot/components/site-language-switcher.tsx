"use client";

import { cn } from "@/lib/utils";
import { useSiteLocale } from "./site-locale-provider";

export function SiteLanguageSwitcher({ mobile = false }: { mobile?: boolean }) {
  const { copy, locale, setLocale } = useSiteLocale();

  return (
    <fieldset
      className={cn(
        "flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1",
        mobile && "w-full justify-center rounded-2xl py-2"
      )}
      data-testid="site-language-switcher"
    >
      <legend className="sr-only">{copy.language.label}</legend>
      <button
        aria-label={copy.language.switchToChinese}
        aria-pressed={locale === "zh-CN"}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition",
          locale === "zh-CN"
            ? "bg-white text-[#001736]"
            : "text-slate-200 hover:bg-white/10 hover:text-white"
        )}
        data-testid="site-locale-zh-CN"
        onClick={() => setLocale("zh-CN")}
        type="button"
      >
        {copy.language.chinese}
      </button>
      <button
        aria-label={copy.language.switchToEnglish}
        aria-pressed={locale === "en"}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition",
          locale === "en"
            ? "bg-white text-[#001736]"
            : "text-slate-200 hover:bg-white/10 hover:text-white"
        )}
        data-testid="site-locale-en"
        onClick={() => setLocale("en")}
        type="button"
      >
        {copy.language.english}
      </button>
    </fieldset>
  );
}
