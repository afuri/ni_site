import { createAuthStorage } from "@utils";
import type { TokenPair, UserRead } from "@api";
import { describe, expect, it } from "vitest";

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStore(): MemoryStore {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    }
  };
}

const tokens: TokenPair = {
  access_token: "access",
  refresh_token: "refresh",
  token_type: "bearer"
};

const user: UserRead = {
  id: 1,
  login: "student",
  email: "student@example.com",
  role: "student",
  is_active: true,
  is_email_verified: true,
  must_change_password: false,
  is_moderator: false,
  moderator_requested: false,
  surname: "Иванов",
  name: "Иван",
  father_name: null,
  country: "Россия",
  city: "Москва",
  school: "Школа",
  class_grade: 7,
  gender: "male",
  subscription: 0,
  subject: null
};

describe("createAuthStorage", () => {
  it("stores and retrieves tokens and user", () => {
    const storage = createAuthStorage({
      storage: createMemoryStore(),
      tokensKey: "tokens",
      userKey: "user"
    });

    storage.setTokens(tokens);
    storage.setUser?.(user);

    expect(storage.getTokens()).toEqual(tokens);
    expect(storage.getUser?.()).toEqual(user);
  });

  it("returns null for invalid json", () => {
    const memory = createMemoryStore();
    memory.setItem("tokens", "not-json");
    const storage = createAuthStorage({
      storage: memory,
      tokensKey: "tokens",
      userKey: "user"
    });

    expect(storage.getTokens()).toBeNull();
  });

  it("clears tokens and user", () => {
    const storage = createAuthStorage({
      storage: createMemoryStore(),
      tokensKey: "tokens",
      userKey: "user"
    });

    storage.setTokens(tokens);
    storage.setUser?.(user);
    storage.clear();

    expect(storage.getTokens()).toBeNull();
    expect(storage.getUser?.()).toBeNull();
  });
});
