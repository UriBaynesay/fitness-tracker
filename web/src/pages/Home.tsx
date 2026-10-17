import { Link } from "react-router";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { UserIcon } from "../components/icons";
import { Screen } from "../components/Screen";

// Placeholder until workout sessions exist: the real Today screen (current plan,
// week strip, targets) arrives with them.
export function Home() {
  const { t } = useTranslation();
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  const { profile } = state;

  // <bdi> isolates user-supplied text (a name, an email) from the surrounding
  // sentence's direction, so a left-to-right email inside Hebrew doesn't scramble.
  return (
    <Screen nav>
      <header className="screen-header">
        <h1 className="title">{t("home.title")}</h1>
        <Link to="/settings" className="icon-button" aria-label={t("settings.open")}>
          <UserIcon />
        </Link>
      </header>
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
    </Screen>
  );
}
