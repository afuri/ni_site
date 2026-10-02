import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ApiClient, TokenPair, UserRead, AuthStorage } from "@api";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";

type SignInResult =
  | { kind: "authenticated"; user: UserRead }
  | { kind: "password_reset_required"; resetToken: string; expiresInSeconds: number };

type AuthContextValue = {
  status: AuthStatus;
  user: UserRead | null;
  tokens: TokenPair | null;
  signIn: (payload: { login: string; password: string }) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
  setSession: (tokens: TokenPair, user: UserRead | null) => void;
  clearSession: () => void;
};

type AuthProviderProps = {
  client: ApiClient;
  storage: AuthStorage;
  children: React.ReactNode;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ client, storage, children }: AuthProviderProps) {
  const sessionGeneration = useRef(0);
  const initialProfileChecked = useRef(false);
  const lastProfileRefreshAt = useRef(0);
  const storageSessionId = useRef(storage.getSessionId?.());
  const [tokens, setTokens] = useState<TokenPair | null>(() => storage.getTokens());
  const [user, setUser] = useState<UserRead | null>(() => storage.getUser?.() ?? null);
  const [status, setStatus] = useState<AuthStatus>(() => {
    if (tokens && user) {
      return "authenticated";
    }
    if (tokens && !user) {
      return "loading";
    }
    return "unauthenticated";
  });

  const setSession = useCallback(
    (nextTokens: TokenPair, nextUser: UserRead | null) => {
      sessionGeneration.current += 1;
      setTokens(nextTokens);
      storage.setTokens(nextTokens);
      setUser(nextUser);
      storage.setUser?.(nextUser);
      setStatus(nextUser ? "authenticated" : "loading");
    },
    [storage]
  );

  const clearSession = useCallback(() => {
    sessionGeneration.current += 1;
    initialProfileChecked.current = false;
    lastProfileRefreshAt.current = 0;
    setTokens(null);
    storage.setTokens(null);
    setUser(null);
    storage.setUser?.(null);
    setStatus("unauthenticated");
  }, [storage]);

  const refreshUser = useCallback(async () => {
    const generation = sessionGeneration.current;
    const hadUser = Boolean(storage.getUser?.());
    if (!storage.getTokens()) return;
    lastProfileRefreshAt.current = Date.now();
    if (!hadUser) setStatus("loading");
    try {
      const me = await client.auth.me();
      if (generation !== sessionGeneration.current || !storage.getTokens()) return;
      setUser(me);
      storage.setUser?.(me);
      setStatus("authenticated");
    } catch {
      if (generation !== sessionGeneration.current) return;
      if (!storage.getTokens()) clearSession();
      else if (!hadUser) setStatus("error");
    }
  }, [client, clearSession, storage]);

  useEffect(() => storage.subscribe?.(() => {
    const nextId = storage.getSessionId?.();
    if (nextId !== storageSessionId.current) {
      storageSessionId.current = nextId;
      sessionGeneration.current += 1;
      initialProfileChecked.current = false;
    }
    const nextTokens = storage.getTokens();
    const nextUser = storage.getUser?.() ?? null;
    setTokens(nextTokens);
    setUser(nextUser);
    setStatus(!nextTokens ? "unauthenticated" : nextUser ? "authenticated" : "loading");
  }), [storage]);

  useEffect(() => {
    if (tokens && !initialProfileChecked.current) {
      initialProfileChecked.current = true;
      void refreshUser();
    }
  }, [tokens, refreshUser]);

  useEffect(() => {
    if (!tokens || !user || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastProfileRefreshAt.current >= 60_000) void refreshUser();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tokens, user, refreshUser]);

  const signIn = useCallback(
    async ({ login, password }: { login: string; password: string }) => {
      clearSession();
      const generation = sessionGeneration.current;
      initialProfileChecked.current = true;
      setStatus("loading");
      try {
        const authTokens = await client.auth.login({ login, password });
        if (generation !== sessionGeneration.current) throw new Error("session_changed");
        if ("reset_token" in authTokens) {
          setStatus("unauthenticated");
          return {
            kind: "password_reset_required" as const,
            resetToken: authTokens.reset_token,
            expiresInSeconds: authTokens.expires_in_seconds
          };
        }
        storage.setTokens(authTokens);
        initialProfileChecked.current = true;
        setTokens(authTokens);
        const id = storage.getSessionId?.();
        const me = await client.auth.me();
        if (id !== storage.getSessionId?.() || !storage.getTokens()) throw new Error("session_changed");
        storage.setUser?.(me);
        setUser(me);
        setStatus("authenticated");
        return { kind: "authenticated" as const, user: me };
      } catch (error) {
        if (!(error instanceof Error && error.message === "session_changed")) setStatus("error");
        throw error;
      }
    },
    [client, storage, clearSession]
  );

  const signOut = useCallback(async () => {
    const id = storage.getSessionId?.();
    const refreshToken = storage.getTokens()?.refresh_token;
    try {
      if (refreshToken) {
        await client.auth.logout({ refresh_token: refreshToken });
      }
    } finally {
      if (id === storage.getSessionId?.()) clearSession();
    }
  }, [client, storage, clearSession]);

  const refresh = useCallback(async () => {
    const refreshed = await client.auth.refresh();
    if (!refreshed) {
      if (!storage.getTokens()) clearSession();
      return false;
    }
    setTokens(refreshed);
    storage.setTokens(refreshed);
    await refreshUser();
    return true;
  }, [client, storage, refreshUser, clearSession]);

  const value = useMemo(
    () => ({
      status,
      user,
      tokens,
      signIn,
      signOut,
      refresh,
      refreshUser,
      setSession,
      clearSession
    }),
    [status, user, tokens, signIn, signOut, refresh, refreshUser, setSession, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export type { AuthStatus, AuthContextValue };
