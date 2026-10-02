import type { AuthStorage, TokenPair, UserRead } from "@api";

type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type AuthStorageOptions = { tokensKey?: string; userKey?: string; storage?: StorageAdapter };
type StoredSession = { tokens: TokenPair; id: string };
const EVENT = "ni-auth-storage";
const memory = new Map<string, string>();
const unavailableStores = new WeakSet<StorageAdapter>();
const memoryStorage: StorageAdapter = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, value); },
  removeItem: key => { memory.delete(key); }
};

export function createAuthStorage(options: AuthStorageOptions = {}) {
  let storage = options.storage;
  if (!storage) {
    try { storage = typeof window === "undefined" ? memoryStorage : window.localStorage; }
    catch { storage = memoryStorage; }
  }
  const tokensKey = options.tokensKey ?? "ni_tokens";
  const userKey = options.userKey ?? "ni_user";
  const currentStore = () => unavailableStores.has(storage!) ? memoryStorage : storage!;
  const useMemory = () => {
    if (unavailableStores.has(storage!)) return;
    for (const key of [tokensKey, userKey]) {
      try {
        const raw = storage!.getItem(key);
        if (raw === null) memoryStorage.removeItem(key);
        else memoryStorage.setItem(key, raw);
      } catch { /* The original store may be completely inaccessible. */ }
    }
    unavailableStores.add(storage!);
  };
  const read = <T,>(key: string): T | null => {
    let raw: string | null;
    try { raw = currentStore().getItem(key); }
    catch { useMemory(); raw = memoryStorage.getItem(key); }
    try { return JSON.parse(raw ?? "null") as T | null; } catch { return null; }
  };
  const notify = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: tokensKey }));
  };
  const write = (key: string, value: unknown) => {
    // Quota failures can leave an older pair on disk. Logout must clear both
    // the fallback and the original store so reload cannot revive that pair.
    if (value === null) {
      try { storage!.removeItem(key); } catch { unavailableStores.add(storage!); }
      memoryStorage.removeItem(key);
      notify();
      return;
    }
    const serialized = JSON.stringify(value);
    try {
      if (currentStore().getItem(key) === serialized) return;
      currentStore().setItem(key, serialized);
    } catch {
      // Disabled/quota-limited storage can keep the current page signed in.
      useMemory();
      memoryStorage.setItem(key, serialized);
    }
    notify();
  };
  const session = (): StoredSession | null => read<StoredSession>(tokensKey);
  const getTokens = (): TokenPair | null => {
    const saved = read<StoredSession | TokenPair>(tokensKey);
    if (!saved) return null;
    return "tokens" in saved ? saved.tokens : saved;
  };
  const setTokens = (tokens: TokenPair | null) => {
    if (!tokens) {
      write(userKey, null);
      write(tokensKey, null);
      return;
    }
    write(tokensKey, { tokens, id: session()?.id ?? crypto.randomUUID() });
  };
  const getSessionId = () => session()?.id ?? null;
  const getUser = (): UserRead | null => getTokens() ? read<UserRead>(userKey) : null;
  const setUser = (user: UserRead | null) => write(userKey, user);
  const subscribe = (listener: () => void) => {
    if (typeof window === "undefined") return () => {};
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === tokensKey || event.key === userKey) listener();
    };
    const onLocal = (event: Event) => {
      if ((event as CustomEvent).detail === tokensKey) listener();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, onLocal);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, onLocal); };
  };
  const initial = read<StoredSession | TokenPair>(tokensKey);
  if (initial && !("tokens" in initial)) setTokens(initial);
  const authStorage: AuthStorage = { getTokens, setTokens, getUser, setUser, getSessionId, subscribe };
  return { ...authStorage, clear: () => setTokens(null) };
}

export type { AuthStorageOptions };
