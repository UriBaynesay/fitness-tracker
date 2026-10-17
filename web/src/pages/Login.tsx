import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { LanguageToggle } from "../components/LanguageToggle";
import { useDocumentTitle } from "../lib/title";

export function Login() {
  const { t } = useTranslation();
  useDocumentTitle(t("auth.loginTitle"));
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "authenticated") return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorCode(null);
    setSubmitting(true);
    try {
      await login({ email, password });
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
      <h1 className="title">{t("auth.loginTitle")}</h1>
      <form className="card form" onSubmit={onSubmit} noValidate>
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {errorCode && (
          <p className="error" role="alert">
            {t(`auth.errors.${errorCode}`, { defaultValue: t("auth.errors.generic") })}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? t("auth.submitting") : t("auth.loginSubmit")}
        </button>
      </form>
      <p className="muted">
        {t("auth.noAccount")} <Link to="/register">{t("auth.toRegister")}</Link>
      </p>
    </main>
  );
}
