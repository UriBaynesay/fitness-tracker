import { useTranslation } from "react-i18next";
import type { Language } from "@fitness/shared";
import { setLanguage } from "../i18n";

const OPTIONS: Language[] = ["en", "he"];

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <div className="segmented" role="group" aria-label={t("language.label")}>
      {OPTIONS.map((language) => (
        <button
          key={language}
          type="button"
          className="segmented-option"
          aria-pressed={i18n.language === language}
          onClick={() => void setLanguage(language)}
        >
          {t(`language.${language}`)}
        </button>
      ))}
    </div>
  );
}
