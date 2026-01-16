import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "@ui";
import { createAuthStorage } from "@utils";
import type { ApiClient, AuthStorage, TokenPair, UserRead } from "@api";
import { describe, expect, it, vi } from "vitest";

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

function createStorage(): AuthStorage & { clear: () => void; setUser?: (user: UserRead | null) => void } {
  return createAuthStorage({
    storage: createMemoryStore(),
    tokensKey: "tokens",
    userKey: "user"
  });
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

function createClient(overrides?: Partial<ApiClient["auth"]>): ApiClient {
  const auth = {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
    ...overrides
  };

  return {
    request: vi.fn(),
    auth
  } as unknown as ApiClient;
}

function TestPanel() {
  const { status, user, signIn, signOut, refresh } = useAuth();

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="user">{user?.login ?? "guest"}</div>
      <button
        type="button"
        onClick={() => {
          void signIn({ login: "student", password: "secret" }).catch(() => {});
        }}
      >
        signIn
      </button>
      <button
        type="button"
        onClick={() => {
          void signOut();
        }}
      >
        signOut
      </button>
      <button
        type="button"
        onClick={() => {
          void refresh();
        }}
      >
        refresh
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  it("starts unauthenticated without tokens", () => {
    const storage = createStorage();
    const client = createClient();

    render(
      <AuthProvider client={client} storage={storage}>
        <TestPanel />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("user")).toHaveTextContent("guest");
  });

  it("loads user when tokens are present", async () => {
    const storage = createStorage();
    storage.setTokens(tokens);
    const client = createClient({ me: vi.fn().mockResolvedValue(user) });

    render(
      <AuthProvider client={client} storage={storage}>
        <TestPanel />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(client.auth.me).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
  });

  it("signs in and stores session", async () => {
    const storage = createStorage();
    const client = createClient({
      login: vi.fn().mockResolvedValue(tokens),
      me: vi.fn().mockResolvedValue(user)
    });

    render(
      <AuthProvider client={client} storage={storage}>
        <TestPanel />
      </AuthProvider>
    );

    const userEventApi = userEvent.setup();
    await userEventApi.click(screen.getByRole("button", { name: "signIn" }));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    expect(storage.getTokens()).toEqual(tokens);
    expect(storage.getUser?.()).toEqual(user);
  });

  it("sets error status on sign-in failure", async () => {
    const storage = createStorage();
    const client = createClient({ login: vi.fn().mockRejectedValue(new Error("bad")) });

    render(
      <AuthProvider client={client} storage={storage}>
        <TestPanel />
      </AuthProvider>
    );

    const userEventApi = userEvent.setup();
    await userEventApi.click(screen.getByRole("button", { name: "signIn" }));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("error");
    });
  });

  it("signs out and clears storage", async () => {
    const storage = createStorage();
    const client = createClient({
      login: vi.fn().mockResolvedValue(tokens),
      me: vi.fn().mockResolvedValue(user),
      logout: vi.fn().mockResolvedValue(undefined)
    });

    render(
      <AuthProvider client={client} storage={storage}>
        <TestPanel />
      </AuthProvider>
    );

    const userEventApi = userEvent.setup();
    await userEventApi.click(screen.getByRole("button", { name: "signIn" }));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    await userEventApi.click(screen.getByRole("button", { name: "signOut" }));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    });

    expect(client.auth.logout).toHaveBeenCalledWith({ refresh_token: "refresh" });
    expect(storage.getTokens()).toBeNull();
  });

  it("clears session when refresh fails", async () => {
    const storage = createStorage();
    storage.setTokens(tokens);
    storage.setUser?.(user);

    const client = createClient({ refresh: vi.fn().mockResolvedValue(null) });

    render(
      <AuthProvider client={client} storage={storage}>
        <TestPanel />
      </AuthProvider>
    );

    const userEventApi = userEvent.setup();
    await userEventApi.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    });

    expect(storage.getTokens()).toBeNull();
  });
});
