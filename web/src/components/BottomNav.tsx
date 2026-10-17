import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { ChartIcon, HomeIcon, ListIcon, TargetIcon } from "./icons";

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
      <NavLink to="/progress" className="bottom-nav-item">
        <ChartIcon />
        {t("nav.progress")}
      </NavLink>
      <NavLink to="/goals" className="bottom-nav-item">
        <TargetIcon />
        {t("nav.goals")}
      </NavLink>
    </nav>
  );
}
