import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { exerciseName, type Exercise, type ExerciseHistory, type Language } from "@fitness/shared";
import { useAuth } from "../auth/AuthContext";
import { Screen } from "../components/Screen";
import { setText } from "../lib/format";
import { loadLibrary, loadProgress, loadTrained } from "../session/data";
import { buildSeries, metricsFor, type Metric } from "../session/progress";

const RECENT_SESSIONS = 10;

// Colours from DESIGN.md. Recharts draws SVG attributes, which cannot read CSS variables.
const COLORS = { accent: "#c8f135", grid: "#2c313b", text: "#9aa0ab", surface: "#1a1d23", border: "#2c313b", ink: "#f3f4f1" };

export function Progress() {
  const { t, i18n } = useTranslation();
  const { state } = useAuth();
  const language = i18n.language as Language;
  const profileId = state.status === "authenticated" ? state.profile.id : null;

  const [trained, setTrained] = useState<Exercise[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("weight");
  const [sessions, setSessions] = useState<ExerciseHistory["sessions"] | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    Promise.all([loadLibrary(profileId), loadTrained(profileId)])
      .then(([library, ids]) => {
        if (cancelled) return;
        const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
        const list = ids.flatMap((id) => byId.get(id) ?? []);
        setTrained(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const selected = trained?.find((exercise) => exercise.id === selectedId) ?? null;
  const metrics = metricsFor(selected?.isTimed ?? false);
  const activeMetric = metrics.includes(metric) ? metric : metrics[0]!;

  useEffect(() => {
    if (!profileId || !selectedId) return;
    let cancelled = false;
    setSessions(null);
    loadProgress(profileId, selectedId)
      .then((found) => !cancelled && setSessions(found))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [profileId, selectedId]);

  const unit = state.status === "authenticated" ? state.profile.weightUnit : "kg";
  const series = useMemo(() => (sessions ? buildSeries(sessions, activeMetric, unit) : []), [sessions, activeMetric, unit]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }), [language]);
  const unitLabel = activeMetric === "weight" || activeMetric === "oneRm" ? unit : activeMetric === "duration" ? "s" : "";

  return (
    <Screen nav>
      <header className="stack">
        <h1 className="title">{t("progress.title")}</h1>
      </header>

      {loadFailed && (
        <p className="error" role="alert">
          {t("errors.load")}
        </p>
      )}
      {trained === null && !loadFailed && <p className="status">{t("loading")}</p>}
      {trained?.length === 0 && <p className="muted">{t("progress.empty")}</p>}

      {trained && trained.length > 0 && (
        <>
          <label className="field">
            <span className="label">{t("progress.exercise")}</span>
            <select className="input" value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
              {trained.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exerciseName(exercise, language)}
                </option>
              ))}
            </select>
          </label>

          {metrics.length > 1 && (
            <div className="segmented" role="group" aria-label={t("progress.metric")}>
              {metrics.map((candidate) => (
                <button key={candidate} type="button" className="segmented-option" aria-pressed={activeMetric === candidate} onClick={() => setMetric(candidate)}>
                  {t(`progress.metrics.${candidate}`)}
                </button>
              ))}
            </div>
          )}

          <section className="card stack" aria-labelledby="chart-title">
            <h2 className="label" id="chart-title">
              {t("progress.chartTitle", { metric: t(`progress.metrics.${activeMetric}`), unit: unitLabel })}
            </h2>
            {sessions === null ? (
              <p className="status">{t("loading")}</p>
            ) : series.length === 0 ? (
              <p className="muted">{t("progress.noData")}</p>
            ) : (
              // Charts read left to right in both languages, so the numbers and dates keep their order.
              <div className="chart" dir="ltr" role="img" aria-label={t("progress.chartLabel", { count: series.length })}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis
                      dataKey="startedAt"
                      tickFormatter={(value: string) => dateFormat.format(new Date(value))}
                      stroke={COLORS.text}
                      tick={{ fill: COLORS.text, fontSize: 12 }}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis stroke={COLORS.text} tick={{ fill: COLORS.text, fontSize: 12 }} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, color: COLORS.ink }}
                      labelStyle={{ color: COLORS.text }}
                      labelFormatter={(value) => dateFormat.format(new Date(String(value)))}
                      formatter={(value) => [`${value} ${unitLabel}`.trim(), t(`progress.metrics.${activeMetric}`)]}
                    />
                    <Line type="monotone" dataKey="value" stroke={COLORS.accent} strokeWidth={3} dot={{ r: 4, fill: COLORS.accent, stroke: COLORS.accent }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {sessions && sessions.length > 0 && (
            <section className="stack" aria-labelledby="recent-title">
              <h2 className="label" id="recent-title">
                {t("progress.recent")}
              </h2>
              <ul className="list">
                {sessions.slice(0, RECENT_SESSIONS).map((session) => (
                  <li key={session.startedAt} className="card stack">
                    <strong>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(new Date(session.startedAt))}</strong>
                    <span className="muted-small" dir="ltr">
                      {session.sets.map((set) => setText(set, unit)).join(" · ")}
                      {selected?.isTimed ? "" : ` ${unit}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Screen>
  );
}
