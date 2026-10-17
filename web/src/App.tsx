import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth/AuthContext";
import { AddExercise } from "./pages/AddExercise";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { PlanEditor } from "./pages/PlanEditor";
import { Plans } from "./pages/Plans";
import { Register } from "./pages/Register";
import { Settings } from "./pages/Settings";

function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const { t } = useTranslation();
  if (state.status === "loading") return <p className="status">{t("loading")}</p>;
  if (state.status === "anonymous") return <Navigate to="/login" replace />;
  return children;
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
      <Route path="/settings" element={protectedRoute(<Settings />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
