import React, { createContext, useContext, useEffect, useState } from "react";
import { Language, TranslationKey, translations } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  isRTL: boolean;
  dir: "rtl" | "ltr";
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem("lang") as Language) || "ar";
  });

  const isRTL = language === "ar";
  const dir = isRTL ? "rtl" : "ltr";

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("lang", lang);
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    document.documentElement.setAttribute("data-lang", language);
  }, [language, dir]);

  const t = (key: TranslationKey): string => {
    return translations[language][key] as string;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
