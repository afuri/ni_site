import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ApiClient, TokenPair, UserRead, AuthStorage } from "@api";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";

type AuthContextValue = {
  status: AuthStatus;
  user: UserRead | null;
  tokens: TokenPair | null;
  signIn: (payload: { login: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<boolean>;
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
      setTokens(nextTokens);
      storage.setTokens(nextTokens);
      setUser(nextUser);
      storage.setUser?.(nextUser);
      setStatus(nextUser ? "authenticated" : "loading");
    },
    [storage]
  );

  const clearSession = useCallback(() => {
    setTokens(null);
    storage.setTokens(null);
    setUser(null);
    storage.setUser?.(null);
    setStatus("unauthenticated");
  }, [storage]);

  const loadUser = useCallback(async () => {
    setStatus("loading");
    try {
      const me = await client.auth.me();
      setUser(me);
      storage.setUser?.(me);
      setStatus("authenticated");
    } catch {
      clearSession();
    }
  }, [client, clearSession, storage]);

  useEffect(() => {
    if (tokens && !user) {
      void loadUser();
    }
  }, [tokens, user, loadUser]);

  const signIn = useCallback(
    async ({ login, password }: { login: string; password: string }) => {
      setStatus("loading");
      try {
        const authTokens = await client.auth.login({ login, password });
        storage.setTokens(authTokens);
        setTokens(authTokens);
        const me = await client.auth.me();
        storage.setUser?.(me);
        setUser(me);
        setStatus("authenticated");
      } catch (error) {
        setStatus("error");
        throw error;
      }
    },
    [client, storage]
  );

  const signOut = useCallback(async () => {
    const refreshToken = storage.getTokens()?.refresh_token;
    try {
      if (refreshToken) {
        await client.auth.logout({ refresh_token: refreshToken });
      }
    } finally {
      clearSession();
    }
  }, [client, storage, clearSession]);

  const refresh = useCallback(async () => {
    const refreshed = await client.auth.refresh();
    if (!refreshed) {
      clearSession();
      return false;
    }
    setTokens(refreshed);
    storage.setTokens(refreshed);
    if (!user) {
      await loadUser();
    }
    return true;
  }, [client, storage, user, loadUser, clearSession]);

  const value = useMemo(
    () => ({
      status,
      user,
      tokens,
      signIn,
      signOut,
      refresh,
      setSession,
      clearSession
    }),
    [status, user, tokens, signIn, signOut, refresh, setSession, clearSession]
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
