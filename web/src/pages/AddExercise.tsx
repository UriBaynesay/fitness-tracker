import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  exerciseName,
  type Equipment,
  type Exercise,
  type Language,
  type MuscleGroup,
  type Plan,
} from "@fitness/shared";
import { ApiError, api } from "../api";
import { CheckIcon, SearchIcon } from "../components/icons";
import { Screen } from "../components/Screen";
import { equipmentKey, muscleGroupKey } from "../lib/labels";

export function AddExercise() {
  const { planId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const dayId = searchParams.get("day") ?? "";
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.language as Language;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [library, setLibrary] = useState<Exercise[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<MuscleGroup>("chest");
  const [newEquipment, setNewEquipment] = useState<Equipment>("barbell");
  const [newTimed, setNewTimed] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.plans.get(planId), api.exercises.list()])
      .then(([planResult, exerciseResult]) => {
        if (cancelled) return;
        setPlan(planResult.plan);
        setLibrary(exerciseResult.exercises);
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const day = plan?.days.find((d) => d.id === dayId) ?? null;
  const backTo = `/plans/${planId}${dayId ? `?day=${dayId}` : ""}`;

  const visible = useMemo(() => {
    if (!library) return [];
    const needle = query.trim().toLowerCase();
    return library
      .filter((exercise) => group === "all" || exercise.muscleGroup === group)
      // Search both languages at once, so an English search finds Hebrew-first users' exercises too.
      .filter(
        (exercise) =>
          needle === "" ||
          (exercise.nameEn ?? "").toLowerCase().includes(needle) ||
          (exercise.nameHe ?? "").toLowerCase().includes(needle)
      )
      .sort((a, b) => exerciseName(a, language).localeCompare(exerciseName(b, language), language));
  }, [library, query, group, language]);

  const selected = library?.find((exercise) => exercise.id === selectedId) ?? null;

  async function onAdd() {
    if (!selected || !dayId) return;
    setErrorCode(null);
    setAdding(true);
    try {
      await api.planExercises.create(dayId, selected.id);
      navigate(backTo);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : "generic");
      setAdding(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (newName.trim() === "") return;
    setCreateError(null);
    try {
      const { exercise } = await api.exercises.create({
        name: newName.trim(),
        muscleGroup: newGroup,
        equipment: newEquipment,
        isTimed: newTimed,
      });
      setLibrary((current) => [...(current ?? []), exercise]);
      setSelectedId(exercise.id);
      setGroup("all");
      setQuery("");
      setCreating(false);
      setNewName("");
      setNewTimed(false);
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.code : "generic");
    }
  }

  return (
    <Screen>
      <header className="picker-header">
        <Link to={backTo} className="back-link">
          {t("common.cancel")}
        </Link>
        {day && <span className="label">{t("addExercise.addingTo", { day: day.name })}</span>}
        <h1 className="title">{t("addExercise.title")}</h1>
      </header>

      {loadFailed && (
        <p className="error" role="alert">
          {t("errors.load")}
        </p>
      )}

      <div className="field">
        <label className="search">
          <SearchIcon />
          <span className="visually-hidden">{t("addExercise.search")}</span>
          <input
            className="search-input"
            type="search"
            dir="auto"
            placeholder={t("addExercise.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="chips chips-scroll" role="group" aria-label={t("addExercise.muscleGroup")}>
          <button type="button" className="chip" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
            {t("addExercise.all")}
          </button>
          {MUSCLE_GROUPS.map((muscle) => (
            <button key={muscle} type="button" className="chip" aria-pressed={group === muscle} onClick={() => setGroup(muscle)}>
              {t(muscleGroupKey(muscle))}
            </button>
          ))}
        </div>
      </div>

      {library && visible.length === 0 && <p className="muted">{t("addExercise.noResults")}</p>}

      <ul className="list">
        {visible.map((exercise) => {
          const isSelected = exercise.id === selectedId;
          return (
            <li key={exercise.id}>
              <button
                type="button"
                className={isSelected ? "list-row list-row-button list-row-active" : "list-row list-row-button"}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(exercise.id)}
              >
                <span className="list-row-main">
                  <span className="list-row-title" dir="auto">
                    {exerciseName(exercise, language)}
                    {exercise.isCustom && <span className="tag">{t("plan.custom")}</span>}
                  </span>
                  <span className="muted-small">
                    {t(muscleGroupKey(exercise.muscleGroup))} · {t(equipmentKey(exercise.equipment))}
                  </span>
                </span>
                {isSelected && (
                  <span className="accent" role="img" aria-label={t("addExercise.selected")}>
                    <CheckIcon />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {creating ? (
        <form className="card form" onSubmit={onCreate}>
          <h2 className="section-title">{t("addExercise.createTitle")}</h2>
          <label className="field">
            <span className="label">{t("addExercise.name")}</span>
            <input className="input" type="text" dir="auto" maxLength={80} autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">{t("addExercise.muscleGroup")}</span>
            <select className="input" value={newGroup} onChange={(e) => setNewGroup(e.target.value as MuscleGroup)}>
              {MUSCLE_GROUPS.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {t(muscleGroupKey(muscle))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">{t("addExercise.equipment")}</span>
            <select className="input" value={newEquipment} onChange={(e) => setNewEquipment(e.target.value as Equipment)}>
              {EQUIPMENT.map((equipment) => (
                <option key={equipment} value={equipment}>
                  {t(equipmentKey(equipment))}
                </option>
              ))}
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={newTimed} onChange={(e) => setNewTimed(e.target.checked)} />
            <span>{t("addExercise.timed")}</span>
          </label>
          {createError && (
            <p className="error" role="alert">
              {t(`errors.${createError}`, { defaultValue: t("errors.save") })}
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={newName.trim() === ""}>
            {t("addExercise.create")}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setCreating(false)}>
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <button className="btn btn-dashed" type="button" onClick={() => setCreating(true)}>
          {t("addExercise.createOwn")}
        </button>
      )}

      {errorCode && (
        <p className="error" role="alert">
          {t(`errors.${errorCode}`, { defaultValue: t("errors.save") })}
        </p>
      )}
      <div className="sticky-action">
        <button className="btn btn-primary" type="button" disabled={!selected || !dayId || adding} onClick={() => void onAdd()}>
          {selected ? t("addExercise.add", { name: exerciseName(selected, language) }) : t("addExercise.addDisabled")}
        </button>
      </div>
    </Screen>
  );
}
