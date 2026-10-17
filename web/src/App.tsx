import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth/AuthContext";
import { AddExercise } from "./pages/AddExercise";
import { Goals } from "./pages/Goals";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { PlanEditor } from "./pages/PlanEditor";
import { Plans } from "./pages/Plans";
import { Register } from "./pages/Register";
import { Settings } from "./pages/Settings";
import { Workout } from "./pages/Workout";
import { WorkoutAddExercise } from "./pages/WorkoutAddExercise";
import { WorkoutSummary } from "./pages/WorkoutSummary";

// The chart library is large and only this screen needs it, so it loads on demand.
// The service worker precaches the chunk, so it still opens offline.
const Progress = lazy(() => import("./pages/Progress").then((module) => ({ default: module.Progress })));

function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const { t } = useTranslation();
  if (state.status === "loading") return <p className="status">{t("loading")}</p>;
  if (state.status === "anonymous") return <Navigate to="/login" replace />;
  return children;
}

function LoadingStatus() {
  const { t } = useTranslation();
  return <p className="status">{t("loading")}</p>;
}

const protectedRoute = (element: ReactNode) => <RequireAuth>{element}</RequireAuth>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={protectedRoute(<Home />)} />
      <Route path="/plans" element={protectedRoute(<Plans />)} />
      <Route path="/plans/:planId" element={protectedRoute(<PlanEditor />)} />
      <Route path="/plans/:planId/add-exercise" element={protectedRoute(<AddExercise />)} />
      <Route path="/workout" element={protectedRoute(<Workout />)} />
      <Route path="/workout/add-exercise" element={protectedRoute(<WorkoutAddExercise />)} />
      <Route path="/workout/summary/:clientId" element={protectedRoute(<WorkoutSummary />)} />
      <Route
        path="/progress"
        element={protectedRoute(
          <Suspense fallback={<LoadingStatus />}>
            <Progress />
          </Suspense>
        )}
      />
      <Route path="/goals" element={protectedRoute(<Goals />)} />
      <Route path="/settings" element={protectedRoute(<Settings />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
