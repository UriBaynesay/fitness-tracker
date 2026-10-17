import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginBody, Profile, RegisterInput, UpdateMeInput } from "@fitness/shared";
import { api } from "../api";
import { setLanguage } from "../i18n";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; profile: Profile };

interface AuthContextValue {
  state: AuthState;
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  // Settings: saves, then adopts the profile the server returns (and its language).
  updateProfile: (body: UpdateMeInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const authenticate = useCallback(async (profile: Profile) => {
    // After login the account's saved language wins over the pre-login toggle.
    await setLanguage(profile.language);
    setState({ status: "authenticated", profile });
  }, []);

  // Ask the server who we are on first load: the session lives in an HttpOnly
  // cookie that JavaScript cannot read, so /me is the only way to find out.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(({ profile }) => {
        if (!cancelled) void authenticate(profile);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, [authenticate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (body) => authenticate((await api.login(body)).profile),
      register: async (body) => authenticate((await api.register(body)).profile),
      logout: async () => {
        await api.logout();
        setState({ status: "anonymous" });
      },
      updateProfile: async (body) => authenticate((await api.updateMe(body)).profile),
    }),
    [state, authenticate]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
