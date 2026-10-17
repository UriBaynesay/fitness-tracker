import { useTranslation } from "react-i18next";
import type { Language } from "@fitness/shared";
import { setLanguage } from "../i18n";

const OPTIONS: Language[] = ["en", "he"];

// Before login this only switches the UI. In Settings the caller passes onSelect
// to save the choice on the account as well.
export function LanguageToggle({ onSelect }: { onSelect?: (language: Language) => void | Promise<void> }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="segmented" role="group" aria-label={t("language.label")}>
      {OPTIONS.map((language) => (
        <button
          key={language}
          type="button"
          className="segmented-option"
          aria-pressed={i18n.language === language}
          onClick={() => void (onSelect ? onSelect(language) : setLanguage(language))}
        >
          {t(`language.${language}`)}
        </button>
      ))}
    </div>
  );
}
