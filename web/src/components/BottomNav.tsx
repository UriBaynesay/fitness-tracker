import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { HomeIcon, ListIcon } from "./icons";

// Only tabs for screens that exist: Progress and Goals join when those screens do.
export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav className="bottom-nav" aria-label={t("nav.main")}>
      <NavLink to="/" end className="bottom-nav-item">
        <HomeIcon />
        {t("nav.today")}
      </NavLink>
      <NavLink to="/plans" className="bottom-nav-item">
        <ListIcon />
        {t("nav.plans")}
      </NavLink>
    </nav>
  );
}
