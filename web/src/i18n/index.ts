import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Language } from "@fitness/shared";
import en from "./locales/en.json";
import he from "./locales/he.json";

const STORAGE_KEY = "language";

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "he") return stored;
  } catch {
    // Storage can be blocked (private mode); fall through to the browser language.
  }
  return navigator.language.toLowerCase().startsWith("he") ? "he" : "en";
}

// Hebrew flips the whole layout to right-to-left; the CSS uses logical
// properties only, so setting dir on the root is all it takes.
export function applyDocumentLanguage(language: Language): void {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "he" ? "rtl" : "ltr";
}

export async function setLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
  applyDocumentLanguage(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not persisted; the profile's language wins after login anyway.
  }
}

const initial = detectLanguage();

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
applyDocumentLanguage(initial);

export default i18n;
