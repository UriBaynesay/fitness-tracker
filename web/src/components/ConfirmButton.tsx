import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmButtonProps {
  label: string;
  question: string;
  onConfirm: () => Promise<void> | void;
  className?: string;
}

// A destructive action asks twice in the page itself: the browser's confirm()
// dialog is blocked in some embedded views and is awkward on a phone.
export function ConfirmButton({ label, question, onConfirm, className = "btn btn-ghost" }: ConfirmButtonProps) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-label={question}>
      <span className="confirm-question">{question}</span>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          setArmed(false);
          void onConfirm();
        }}
      >
        {label}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setArmed(false)}>
        {t("common.cancel")}
      </button>
    </div>
  );
}
