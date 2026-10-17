import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginBody, Profile, RegisterInput, UpdateMeInput } from "@fitness/shared";
import { ApiError, api } from "../api";
import { clearProfileData, readCache, removeCache, writeCache } from "../session/store";
import { profileAfterFailure } from "./offline";
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
  // Deletes the account for good (password required), then forgets it on this device.
  deleteAccount: (password: string) => Promise<void>;
  // Settings: saves, then adopts the profile the server returns (and its language).
  updateProfile: (body: UpdateMeInput) => Promise<void>;
}

const LAST_PROFILE_KEY = "lastProfile";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const authenticate = useCallback(async (profile: Profile) => {
    // After login the account's saved language wins over the pre-login toggle.
    await setLanguage(profile.language);
    // Remembered so the app can still open when the next start has no network.
    void writeCache(LAST_PROFILE_KEY, profile).catch(() => undefined);
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
      .catch(async (error: unknown) => {
        // No connection (or a dead server) is not "signed out": open with the profile
        // this device last saw, so a workout can be logged at a gym with no signal.
        const remembered = await readCache<Profile>(LAST_PROFILE_KEY).catch(() => undefined);
        if (cancelled) return;
        const offline = profileAfterFailure(error, remembered);
        if (offline) {
          void authenticate(offline);
          return;
        }
        if (error instanceof ApiError && error.status === 401) void removeCache(LAST_PROFILE_KEY).catch(() => undefined);
        setState({ status: "anonymous" });
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
        void removeCache(LAST_PROFILE_KEY).catch(() => undefined);
        setState({ status: "anonymous" });
      },
      deleteAccount: async (password) => {
        if (state.status !== "authenticated") return;
        await api.deleteAccount(password);
        await clearProfileData(state.profile.id).catch(() => undefined);
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
