import { Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth/AuthContext";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const { t } = useTranslation();
  if (state.status === "loading") return <p className="status">{t("loading")}</p>;
  if (state.status === "anonymous") return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
