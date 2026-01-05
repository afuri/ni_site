import type { AuthStorage, TokenPair, UserRead } from "@api";

type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type AuthStorageOptions = {
  tokensKey?: string;
  userKey?: string;
  storage?: StorageAdapter;
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

function resolveStorage(custom?: StorageAdapter): StorageAdapter {
  if (custom) {
    return custom;
  }
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage;
}

export function createAuthStorage(options: AuthStorageOptions = {}) {
  const storage = resolveStorage(options.storage);
  const tokensKey = options.tokensKey ?? "ni_tokens";
  const userKey = options.userKey ?? "ni_user";

  const getTokens = (): TokenPair | null => {
    const raw = storage.getItem(tokensKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as TokenPair;
    } catch {
      return null;
    }
  };

  const setTokens = (tokens: TokenPair | null) => {
    if (!tokens) {
      storage.removeItem(tokensKey);
      return;
    }
    storage.setItem(tokensKey, JSON.stringify(tokens));
  };

  const getUser = (): UserRead | null => {
    const raw = storage.getItem(userKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as UserRead;
    } catch {
      return null;
    }
  };

  const setUser = (user: UserRead | null) => {
    if (!user) {
      storage.removeItem(userKey);
      return;
    }
    storage.setItem(userKey, JSON.stringify(user));
  };

  const clear = () => {
    storage.removeItem(tokensKey);
    storage.removeItem(userKey);
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

export type { AuthStorageOptions };
