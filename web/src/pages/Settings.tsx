import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { Language, WeightUnit } from "@fitness/shared";
import { useAuth } from "../auth/AuthContext";
import { TextField } from "../components/fields";
import { ChevronStartIcon } from "../components/icons";
import { LanguageToggle } from "../components/LanguageToggle";
import { Screen } from "../components/Screen";
import { readDeviceSettings, writeDeviceSettings, type DeviceSettings } from "../session/device";

const UNITS: WeightUnit[] = ["kg", "lb"];

export function Settings() {
  const { t } = useTranslation();
  const { state, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const [device, setDevice] = useState<DeviceSettings>(readDeviceSettings);
  if (state.status !== "authenticated") return null;
  const { profile } = state;

  async function save(body: { language?: Language; weightUnit?: WeightUnit; displayName?: string }) {
    setError(false);
    try {
      await updateProfile(body);
    } catch {
      setError(true);
    }
  }

  return (
    <Screen>
      <header className="screen-header">
        <Link to="/" className="back-link">
          <ChevronStartIcon />
          {t("common.back")}
        </Link>
      </header>
      <h1 className="title">{t("settings.title")}</h1>
      {error && (
        <p className="error" role="alert">
          {t("errors.save")}
        </p>
      )}

      <section className="card form">
        <div className="field">
          <span className="label">{t("settings.language")}</span>
          <LanguageToggle onSelect={(language) => save({ language })} />
        </div>

        <div className="field">
          <span className="label">{t("settings.weightUnit")}</span>
          <div className="segmented" role="group" aria-label={t("settings.weightUnit")}>
            {UNITS.map((unit) => (
              <button
                key={unit}
                type="button"
                className="segmented-option"
                aria-pressed={profile.weightUnit === unit}
                onClick={() => void save({ weightUnit: unit })}
              >
                {t(`settings.${unit}`)}
              </button>
            ))}
          </div>
        </div>

        <TextField label={t("settings.name")} value={profile.displayName ?? ""} onCommit={(displayName) => save({ displayName })} />
      </section>

      <section className="card form">
        <h2 className="section-title">{t("settings.device")}</h2>
        <p className="muted">{t("settings.deviceHint")}</p>
        {(["sound", "vibration", "keepAwake"] as const).map((key) => (
          <label key={key} className="check-row">
            <input
              type="checkbox"
              checked={device[key]}
              onChange={(event) => {
                const next = { ...device, [key]: event.target.checked };
                setDevice(next);
                writeDeviceSettings(next);
              }}
            />
            <span>{t(`settings.${key}`)}</span>
          </label>
        ))}
      </section>

      <section className="card form">
        <h2 className="section-title">{t("settings.account")}</h2>
        <p className="muted">
          <span className="label">{t("settings.email")}</span>
          <br />
          <bdi dir="ltr">{profile.email}</bdi>
        </p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        >
          {t("auth.logout")}
        </button>
      </section>
    </Screen>
  );
}
