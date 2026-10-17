import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface StepperProps {
  label: string;
  unit?: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

// Tidies float noise (2.5 + 2.5 + 0.1) so the field never shows 7.600000000000001.
const tidy = (value: number) => Math.round(value * 100) / 100;

// A big - / + pair for gym use, with the number itself typeable for large jumps.
export function Stepper({ label, unit, value, step, min, max, onChange }: StepperProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clamp = (next: number) => Math.min(max, Math.max(min, tidy(next)));

  function onType(text: string) {
    setDraft(text);
    const parsed = Number(text.trim().replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(tidy(parsed));
  }

  return (
    <div className="stepper" role="group" aria-label={label}>
      <span className="label">
        {label}
        {unit ? ` (${unit})` : ""}
      </span>
      <div className="stepper-controls">
        <button
          type="button"
          className="stepper-button"
          aria-label={t("workout.decrease", { label })}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <input
          className="stepper-input"
          type="text"
          inputMode="decimal"
          dir="ltr"
          aria-label={label}
          value={draft}
          onChange={(event) => onType(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => setDraft(String(value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <button
          type="button"
          className="stepper-button"
          aria-label={t("workout.increase", { label })}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
      </div>
    </div>
  );
}
