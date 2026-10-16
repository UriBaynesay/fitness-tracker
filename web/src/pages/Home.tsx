import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";

// Milestone 1 placeholder: proves the protected route end to end. The real
// Today screen (current plan, week strip, targets) arrives with plans.
export function Home() {
  const { t } = useTranslation();
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  if (state.status !== "authenticated") return null;
  const { profile } = state;

  return (
    <main className="screen">
      <h1 className="title">{t("home.title")}</h1>
      <section className="card">
        <p className="welcome">{t("home.welcome", { name: profile.displayName ?? profile.email })}</p>
        <p className="muted" dir="auto">
          {t("home.signedInAs", { email: profile.email })}
        </p>
        <p>{t("home.placeholder")}</p>
      </section>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={async () => {
          await logout();
          navigate("/login", { replace: true });
        }}
      >
        {t("auth.logout")}
      </button>
    </main>
  );
}
