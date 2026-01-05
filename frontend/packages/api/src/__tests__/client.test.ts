import { createApiClient } from "@api";
import type { ApiError, AuthStorage, TokenPair } from "@api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const BASE_URL = "http://localhost/api";

function makeResponse(status: number, body?: unknown): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body ? JSON.stringify(body) : "")
  };
}

function createStorage(tokens: TokenPair | null, setTokensSpy?: (tokens: TokenPair | null) => void): AuthStorage {
  let currentTokens = tokens;

  return {
    getTokens: () => currentTokens,
    setTokens: (next) => {
      currentTokens = next;
      setTokensSpy?.(next);
    }
  };
}

describe("api client", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it("adds auth header when token is present", async () => {
    const tokens: TokenPair = {
      access_token: "access",
      refresh_token: "refresh",
      token_type: "bearer"
    };
    const client = createApiClient({
      baseUrl: BASE_URL,
      storage: createStorage(tokens)
    });

    fetchMock.mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await client.request<{ ok: boolean }>({ path: "/health" });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access");
  });

  it("skips json header for FormData", async () => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      storage: createStorage(null)
    });

    fetchMock.mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const form = new FormData();
    await client.request({ path: "/uploads", method: "POST", body: form, auth: false });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("throws ApiError with payload details", async () => {
    const client = createApiClient({ baseUrl: BASE_URL, storage: createStorage(null) });

    fetchMock.mockResolvedValueOnce(
      makeResponse(409, {
        error: {
          code: "olympiad_not_available",
          message: "olympiad_not_available",
          details: { reason: "age" }
        },
        request_id: "req-1"
      })
    );

    let caught: ApiError | null = null;
    try {
      await client.request({
        path: "/attempts/start",
        method: "POST",
        body: { olympiad_id: 1 }
      });
    } catch (error) {
      caught = error as ApiError;
    }

    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(409);
    expect(caught?.code).toBe("olympiad_not_available");
    expect(caught?.request_id).toBe("req-1");
    expect(caught?.details).toMatchObject({ reason: "age" });
  });

  it("refreshes token on 401 and retries request", async () => {
    const initialTokens: TokenPair = {
      access_token: "access-old",
      refresh_token: "refresh-old",
      token_type: "bearer"
    };
    const refreshedTokens: TokenPair = {
      access_token: "access-new",
      refresh_token: "refresh-new",
      token_type: "bearer"
    };
    const setTokensSpy = vi.fn();
    const client = createApiClient({
      baseUrl: BASE_URL,
      storage: createStorage(initialTokens, setTokensSpy)
    });

    let secureCount = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(makeResponse(200, refreshedTokens));
      }
      if (url.endsWith("/secure")) {
        if (secureCount === 0) {
          secureCount += 1;
          return Promise.resolve(makeResponse(401, { error: { code: "invalid_token" } }));
        }
        secureCount += 1;
        return Promise.resolve(makeResponse(200, { ok: true }));
      }
      return Promise.resolve(makeResponse(200, { ok: true }));
    });

    const response = await client.request<{ ok: boolean }>({ path: "/secure" });

    expect(response.ok).toBe(true);
    expect(setTokensSpy).toHaveBeenCalledWith(refreshedTokens);

    const secureCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/secure"));
    expect(secureCalls).toHaveLength(2);
    const headers = secureCalls[1][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access-new");
  });

  it("calls onAuthError when refresh fails", async () => {
    const tokens: TokenPair = {
      access_token: "access",
      refresh_token: "refresh",
      token_type: "bearer"
    };
    const onAuthError = vi.fn();
    const client = createApiClient({
      baseUrl: BASE_URL,
      storage: createStorage(tokens),
      onAuthError
    });

    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(makeResponse(401, { error: { code: "invalid_token" } }));
      }
      return Promise.resolve(makeResponse(401, { error: { code: "invalid_token" } }));
    });

    await expect(client.request({ path: "/secure" })).rejects.toMatchObject({ status: 401 });
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });

  it("returns null when refresh token is missing", async () => {
    const client = createApiClient({ baseUrl: BASE_URL, storage: createStorage(null) });

    fetchMock.mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const result = await client.auth.refresh();
    expect(result).toBeNull();
  });
});
