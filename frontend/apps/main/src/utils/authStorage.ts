import type { AuthStorage, TokenPair, UserRead } from "@api";

type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const memoryStore = new Map<string, string>();

const memoryStorage: StorageAdapter = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  }
};

const resolveStorage = (custom?: StorageAdapter): StorageAdapter => custom ?? memoryStorage;

const ACCESS_TOKEN_KEY = "ni_main_access_token";
const REFRESH_TOKEN_KEY = "ni_main_refresh_token";
const LEGACY_TOKENS_KEY = "ni_main_tokens";
const USER_KEY = "ni_main_user";

const parseJson = <T,>(raw: string | null): T | null => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export function createMainAuthStorage() {
  const hasWindow = typeof window !== "undefined";
  const accessStorage = resolveStorage(hasWindow ? window.sessionStorage : undefined);
  const refreshStorage = resolveStorage(hasWindow ? window.localStorage : undefined);
  const userStorage = accessStorage;

  const setTokens = (tokens: TokenPair | null) => {
    if (!tokens) {
      accessStorage.removeItem(ACCESS_TOKEN_KEY);
      refreshStorage.removeItem(REFRESH_TOKEN_KEY);
      accessStorage.removeItem(LEGACY_TOKENS_KEY);
      return;
    }
    const accessPayload = {
      access_token: tokens.access_token,
      token_type: tokens.token_type,
      must_change_password: tokens.must_change_password
    };
    const refreshPayload = { refresh_token: tokens.refresh_token };
    accessStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(accessPayload));
    refreshStorage.setItem(REFRESH_TOKEN_KEY, JSON.stringify(refreshPayload));
    accessStorage.removeItem(LEGACY_TOKENS_KEY);
  };

  const migrateLegacyTokens = () => {
    const legacy = parseJson<TokenPair>(accessStorage.getItem(LEGACY_TOKENS_KEY));
    if (legacy?.access_token && legacy.refresh_token) {
      setTokens(legacy);
      return legacy;
    }
    return null;
  };

  const getTokens = (): TokenPair | null => {
    const accessPayload = parseJson<{
      access_token?: string;
      token_type?: TokenPair["token_type"];
      must_change_password?: boolean;
    }>(accessStorage.getItem(ACCESS_TOKEN_KEY));
    const refreshPayload = parseJson<{ refresh_token?: string }>(
      refreshStorage.getItem(REFRESH_TOKEN_KEY)
    );
    if (!accessPayload?.access_token) {
      const migrated = migrateLegacyTokens();
      if (migrated?.access_token) {
        return {
          access_token: migrated.access_token,
          refresh_token: migrated.refresh_token ?? "",
          token_type: migrated.token_type ?? "bearer",
          must_change_password: migrated.must_change_password
        };
      }
      return null;
    }
    return {
      access_token: accessPayload.access_token,
      refresh_token: refreshPayload?.refresh_token ?? "",
      token_type: accessPayload.token_type ?? "bearer",
      must_change_password: accessPayload.must_change_password
    };
  };

  const getUser = (): UserRead | null => parseJson<UserRead>(userStorage.getItem(USER_KEY));

  const setUser = (user: UserRead | null) => {
    if (!user) {
      userStorage.removeItem(USER_KEY);
      return;
    }
    userStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const clear = () => {
    accessStorage.removeItem(ACCESS_TOKEN_KEY);
    refreshStorage.removeItem(REFRESH_TOKEN_KEY);
    accessStorage.removeItem(LEGACY_TOKENS_KEY);
    userStorage.removeItem(USER_KEY);
  };

  const authStorage: AuthStorage = {
    getTokens,
    setTokens,
    getUser,
    setUser
  };

  return {
    ...authStorage,
    clear
  };
}
