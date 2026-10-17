import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  exerciseName,
  type Equipment,
  type Exercise,
  type Language,
  type MuscleGroup,
} from "@fitness/shared";
import { ApiError, api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { equipmentKey, muscleGroupKey } from "../lib/labels";
import { loadLibrary } from "../session/data";
import { CheckIcon, SearchIcon } from "./icons";
import { Screen } from "./Screen";

interface ExercisePickerProps {
  backTo: string;
  // "Adding to Push day": says where the choice will go.
  contextLabel?: string | null;
  confirmLabel: (name: string) => string;
  idleLabel: string;
  // False until whatever the choice is added to is known (a plan day, a workout).
  canConfirm?: boolean;
  // Throw to show an error and stay on the screen; return to let the caller navigate.
  onConfirm: (exercise: Exercise) => Promise<void>;
}

// Search, filter by muscle group and pick an exercise (or create your own). Used to
// add to a plan day and to add to a workout in progress.
export function ExercisePicker({ backTo, contextLabel, confirmLabel, idleLabel, canConfirm = true, onConfirm }: ExercisePickerProps) {
  const { t, i18n } = useTranslation();
  const { state } = useAuth();
  const language = i18n.language as Language;
  const profileId = state.status === "authenticated" ? state.profile.id : null;

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
    if (!profileId) return;
    let cancelled = false;
    loadLibrary(profileId)
      .then((exercises) => !cancelled && setLibrary(exercises))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

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
    if (!selected || !canConfirm) return;
    setErrorCode(null);
    setAdding(true);
    try {
      await onConfirm(selected);
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
        {contextLabel && <span className="label">{contextLabel}</span>}
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
        <button className="btn btn-primary" type="button" disabled={!selected || !canConfirm || adding} onClick={() => void onAdd()}>
          {selected ? confirmLabel(exerciseName(selected, language)) : idleLabel}
        </button>
      </div>
    </Screen>
  );
}
