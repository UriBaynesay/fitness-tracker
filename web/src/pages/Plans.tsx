import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { PlanSummary } from "@fitness/shared";
import { ApiError, api } from "../api";
import { Screen } from "../components/Screen";
import { useDocumentTitle } from "../lib/title";

export function Plans() {
  const { t } = useTranslation();
  useDocumentTitle(t("plans.title"));
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.plans
      .list()
      .then(({ plans: list }) => !cancelled && setPlans(list))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    setErrorCode(null);
    setSubmitting(true);
    try {
      const { plan } = await api.plans.create(name.trim());
      navigate(`/plans/${plan.id}`);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : "generic");
      setSubmitting(false);
    }
  }

  return (
    <Screen nav>
      <h1 className="title">{t("plans.title")}</h1>

      {loadFailed && (
        <p className="error" role="alert">
          {t("errors.load")}
        </p>
      )}
      {plans && plans.length === 0 && <p className="muted">{t("plans.empty")}</p>}

      {plans && plans.length > 0 && (
        <ul className="list">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link to={`/plans/${plan.id}`} className={plan.isActive ? "list-row list-row-active" : "list-row"}>
                <span className="list-row-main">
                  <span className="list-row-title" dir="auto">
                    {plan.name}
                  </span>
                  <span className="muted-small">{t("plans.counts", { days: plan.dayCount, exercises: plan.exerciseCount })}</span>
                </span>
                {plan.isActive && <span className="pill">{t("plans.active")}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <form className="card form" onSubmit={onCreate}>
          <label className="field">
            <span className="label">{t("plans.nameLabel")}</span>
            <input
              className="input"
              type="text"
              dir="auto"
              maxLength={80}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {errorCode && (
            <p className="error" role="alert">
              {t(`errors.${errorCode}`, { defaultValue: t("errors.save") })}
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={submitting || name.trim() === ""}>
            {t("plans.create")}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setCreating(false)}>
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <button className="btn btn-dashed" type="button" onClick={() => setCreating(true)}>
          {t("plans.new")}
        </button>
      )}
    </Screen>
  );
}
