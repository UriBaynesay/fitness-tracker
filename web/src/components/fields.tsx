import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Status = "idle" | "saving" | "saved" | "error";

// Autosaving fields commit on blur or Enter. This tracks one commit's life
// (saving -> saved -> idle, or error) so each field can show it next to itself.
function useSaveStatus() {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function track(action: () => Promise<void>): Promise<boolean> {
    window.clearTimeout(timer.current);
    setStatus("saving");
    try {
      await action();
      setStatus("saved");
      timer.current = window.setTimeout(() => setStatus("idle"), 1500);
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }
  return { status, track };
}

function StatusHint({ status }: { status: Status }) {
  const { t } = useTranslation();
  const text =
    status === "saving" ? t("common.saving") : status === "saved" ? t("common.saved") : status === "error" ? t("errors.save") : "";
  return (
    <span className={`hint hint-${status}`} role="status" aria-live="polite">
      {text}
    </span>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  integer?: boolean;
  onCommit: (value: number) => Promise<void>;
}

export function NumberField({ label, value, min, max, integer = true, onCommit }: NumberFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  const { status, track } = useSaveStatus();

  // Whatever the server last said wins over a stale draft.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  async function commit() {
    const text = draft.trim().replace(",", ".");
    const parsed = Number(text);
    const valid = text !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max && (!integer || Number.isInteger(parsed));
    if (!valid) {
      setInvalid(true);
      setDraft(String(value));
      return;
    }
    setInvalid(false);
    if (parsed === value) return;
    const saved = await track(() => onCommit(parsed));
    if (!saved) setDraft(String(value));
  }

  return (
    <label className="field-compact">
      <span className="field-label">{label}</span>
      <input
        className="input input-compact"
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        dir="ltr"
        enterKeyHint="done"
        value={draft}
        aria-invalid={invalid}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {invalid ? (
        <span className="hint hint-error" role="alert">
          {t("plan.invalid", { min, max })}
        </span>
      ) : (
        <StatusHint status={status} />
      )}
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  maxLength?: number;
  onCommit: (value: string) => Promise<void>;
}

export function TextField({ label, value, maxLength = 80, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  const { status, track } = useSaveStatus();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function commit() {
    const text = draft.trim();
    if (text === "" || text === value) {
      setDraft(value);
      return;
    }
    const saved = await track(() => onCommit(text));
    if (!saved) setDraft(value);
  }

  return (
    <label className="field-compact">
      <span className="field-label">{label}</span>
      <input
        className="input input-compact"
        type="text"
        dir="auto"
        maxLength={maxLength}
        enterKeyHint="done"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <StatusHint status={status} />
    </label>
  );
}
