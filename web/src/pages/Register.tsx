import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { PASSWORD_MIN_LENGTH, type Language } from "@fitness/shared";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { LanguageToggle } from "../components/LanguageToggle";

export function Register() {
  const { t, i18n } = useTranslation();
  const { state, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "authenticated") return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorCode(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setErrorCode("passwordTooShort");
      return;
    }
    setSubmitting(true);
    try {
      await register({
        email,
        password,
        displayName: displayName.trim() || undefined,
        // The account starts in whichever language the toggle is showing.
        language: i18n.language as Language,
      });
      navigate("/", { replace: true });
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : "generic");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="screen">
      <LanguageToggle />
      <h1 className="title">{t("auth.registerTitle")}</h1>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="label">{t("auth.displayName")}</span>
          <input
            className="input"
            type="text"
            autoComplete="name"
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">{t("auth.email")}</span>
          <input
            className="input"
            type="email"
            dir="ltr"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">{t("auth.password")}</span>
          <input
            className="input"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="hint">{t("auth.passwordHint")}</span>
        </label>
        {errorCode && (
          <p className="error" role="alert">
            {t(`auth.errors.${errorCode}`, { defaultValue: t("auth.errors.generic") })}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? t("auth.submitting") : t("auth.registerSubmit")}
        </button>
      </form>
      <p className="muted">
        {t("auth.haveAccount")} <Link to="/login">{t("auth.toLogin")}</Link>
      </p>
    </main>
  );
}
