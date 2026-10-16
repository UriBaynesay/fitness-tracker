import { useNavigate } from "react-router";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";

// Milestone 1 placeholder: proves the protected route end to end. The real
// Today screen (current plan, week strip, targets) arrives with plans.
export function Home() {
  const { t } = useTranslation();
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  if (state.status !== "authenticated") return null;
  const { profile } = state;

  // <bdi> isolates user-supplied text (a name, an email) from the surrounding
  // sentence's direction, so a left-to-right email inside Hebrew doesn't scramble.
  return (
    <main className="screen">
      <h1 className="title">{t("home.title")}</h1>
      <section className="card">
        <p className="welcome">
          {profile.displayName ? (
            <Trans i18nKey="home.welcomeName" values={{ name: profile.displayName }} components={{ name: <bdi /> }} />
          ) : (
            t("home.welcome")
          )}
        </p>
        <p className="muted">
          <Trans i18nKey="home.signedInAs" values={{ email: profile.email }} components={{ email: <bdi dir="ltr" /> }} />
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
