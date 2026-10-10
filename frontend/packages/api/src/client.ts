import { serverClock } from "./serverClock";
import type {
  ApiError,
  ApiErrorResponse,
  AuthStorage,
  AuthLoginResponse,
  RegionLookup,
  SchoolLookup,
  SchoolSubmission,
  SchoolSubmissionCreate,
  TokenPair,
  UserRead
} from "./types";

type RequestOptions = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  responseType?: "json" | "blob";
  timeoutMs?: number;
};

type ClientOptions = {
  baseUrl: string;
  storage?: AuthStorage;
  onAuthError?: () => void;
  timeoutMs?: number;
};

type LoginPayload = {
  login: string;
  password: string;
};

type RefreshPayload = {
  refresh_token?: string;
  clearOnFail?: boolean;
};

type RegisterPayload = {
  login: string;
  password: string;
  role: "student" | "teacher";
  email: string;
  gender: "male" | "female";
  subscription?: number;
  surname: string;
  name: string;
  father_name: string | null;
  region_id: number;
  school_id: number | null;
  school_not_found: boolean;
  class_grade: number | null;
  subject: string | null;
};

type ApiClient = {
  request: <T>(options: RequestOptions) => Promise<T>;
  auth: {
    login: (payload: LoginPayload) => Promise<AuthLoginResponse>;
    refresh: (payload?: RefreshPayload) => Promise<TokenPair | null>;
    logout: (payload: RefreshPayload) => Promise<void>;
    register: (payload: RegisterPayload) => Promise<UserRead>;
    me: () => Promise<UserRead>;
  };
  lookup: {
    regions: (options?: { query?: string; limit?: number; signal?: AbortSignal }) => Promise<RegionLookup[]>;
    schools: (options: { regionId: number; query: string; limit?: number; offset?: number; signal?: AbortSignal }) => Promise<SchoolLookup[]>;
  };
  schoolSubmissions: {
    getMine: () => Promise<SchoolSubmission | null>;
    create: (payload: SchoolSubmissionCreate) => Promise<SchoolSubmission>;
  };
};

const JSON_HEADERS = {
  "Content-Type": "application/json"
};

const EMPTY_BODY_STATUS = new Set([204, 205]);

function buildQuery(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    const stringValue = String(value).trim();
    if (!stringValue) {
      return;
    }
    searchParams.set(key, stringValue);
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

async function parseJson<T>(response: Response): Promise<T | null> {
  if (EMPTY_BODY_STATUS.has(response.status)) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function buildApiError(
  response: Response,
  payload: ApiErrorResponse | null
): ApiError {
  const fallbackCode = response.status >= 500 ? "server_error" : "request_error";
  let details = payload?.error?.details ?? {};
  const retryAfter = response.headers?.get?.("Retry-After");
  if (response.status === 429 && retryAfter && /^\d+$/.test(retryAfter) && !Array.isArray(details)) {
    details = { ...details, retry_after_seconds: Number(retryAfter) };
  }
  return {
    status: response.status,
    code: payload?.error?.code ?? fallbackCode,
    message: payload?.error?.message ?? payload?.error?.code ?? fallbackCode,
    details,
    request_id: payload?.request_id
  };
}

// Coordinates separate clients in one realm; Web Locks serializes browser tabs.
const sharedRefreshes = new Map<string, Promise<TokenPair | null>>();

export function createApiClient(options: ClientOptions): ApiClient {
  const { baseUrl, storage, onAuthError } = options;
  serverClock.configure(baseUrl);
  const timeoutMs = options.timeoutMs ?? 15000;
  const sessionChanged = () => ({ status: 401, code: "session_changed", message: "Вход изменён в другой вкладке.", details: {} });
  const fetchBody = async <T,>(url: string, init: RequestInit, responseType: "json" | "blob" = "json", requestTimeoutMs = timeoutMs): Promise<{ response: Response; body: T | null }> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    if (init.signal?.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(url, { ...init, signal: controller.signal });
          if (!controller.signal.aborted && Number(response.headers?.get("Age") ?? 0) === 0) {
            serverClock.observe(response.headers?.get("X-Server-Time"));
          }
          return { response, body: response.ok && responseType === "blob" ? await response.blob() as T : await parseJson<T>(response) };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("request_timeout")); }, requestTimeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer!);
      init.signal?.removeEventListener("abort", abort);
    }
  };
  const MIN_REFRESH_TOKEN_LENGTH = 20;
  const REFRESH_COOLDOWN_MS = 30000;
  let refreshPromise: Promise<TokenPair | null> | null = null;
  let refreshBlockedUntil = 0;
  let refreshOwner = storage?.getSessionId?.();

  const request = async <T>(
    requestOptions: RequestOptions,
    retryOnAuth = true
  ): Promise<T> => {
    const {
      path,
      method = "GET",
      body,
      auth = true,
      headers = {},
      signal,
      responseType = "json",
      timeoutMs: requestTimeoutMs = timeoutMs
    } = requestOptions;

    const sessionId = storage?.getSessionId?.();
    const token = auth ? storage?.getTokens()?.access_token : null;
    const ensureSession = () => {
      if (auth && sessionId !== storage?.getSessionId?.()) throw sessionChanged();
    };
    const initHeaders: Record<string, string> = {
      ...headers
    };
    if (!(body instanceof FormData) && body !== undefined) {
      Object.assign(initHeaders, JSON_HEADERS);
    }
    if (token) {
      initHeaders.Authorization = `Bearer ${token}`;
    }

    const { response, body: responseBody } = await fetchBody<T | ApiErrorResponse>(`${baseUrl}${path}`, {
      method,
      headers: initHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal
    }, responseType, requestTimeoutMs);

    ensureSession();
    if (response.status === 401 && retryOnAuth && auth && storage) {
      if (storage.getTokens()?.access_token && storage.getTokens()?.access_token !== token) {
        return request<T>(requestOptions, false);
      }
      const refreshed = await refreshTokens();
      if (!refreshed && !storage.getTokens()) {
        onAuthError?.();
        throw buildApiError(response, responseBody as ApiErrorResponse | null);
      }
      ensureSession();
      if (refreshed) {
        return request<T>(requestOptions, false);
      }
      if (!storage.getTokens()) onAuthError?.();
    }

    if (!response.ok) {
      throw buildApiError(response, responseBody as ApiErrorResponse | null);
    }

    return (responseBody ?? (undefined as T)) as T;
  };

  const refreshTokens = async (payload?: RefreshPayload): Promise<TokenPair | null> => {
    const owner = storage?.getSessionId?.();
    if (owner !== refreshOwner) {
      if (refreshPromise) { await refreshPromise; return refreshTokens(payload); }
      refreshOwner = owner;
      refreshBlockedUntil = 0;
    }
    const now = Date.now();
    if (now < refreshBlockedUntil) {
      return null;
    }
    if (refreshPromise) {
      return refreshPromise;
    }

    const clearOnFail = payload?.clearOnFail ?? true;
    const rawRefresh = payload?.refresh_token ?? storage?.getTokens()?.refresh_token;
    const refreshToken =
      typeof rawRefresh === "string" && rawRefresh.trim().length >= MIN_REFRESH_TOKEN_LENGTH
        ? rawRefresh.trim()
        : null;
    if (!refreshToken) {
      if (clearOnFail) {
        storage?.setTokens(null);
      }
      return null;
    }

    const sessionId = storage?.getSessionId?.();
    const sameSession = () => sessionId === storage?.getSessionId?.();
    const adoptLatest = (): TokenPair | null => {
      if (!sameSession()) return null;
      const latest = storage?.getTokens();
      return latest && latest.refresh_token !== refreshToken ? latest : null;
    };
    const coordinationKey = `${baseUrl}|${sessionId ?? ""}|${refreshToken}`;
    const existingRefresh = sharedRefreshes.get(coordinationKey);
    if (existingRefresh) {
      const result = await existingRefresh;
      const current = storage?.getTokens();
      if (sameSession() && result && current && (current.refresh_token === refreshToken || current.refresh_token === result.refresh_token)) {
        storage?.setTokens(result);
        return result;
      }
      return sameSession() ? (storage ? (current ?? null) : result) : null;
    }
    let rotatingToken = refreshToken;
    const rotate = async (): Promise<TokenPair | null> => {
      const latest = storage?.getTokens();
      if (!sameSession() || (storage && !latest)) return null;
      const adopted = adoptLatest();
      if (adopted) return adopted;
      if (latest && latest.refresh_token !== refreshToken) rotatingToken = latest.refresh_token;
      const operationStorageKey = `ni_refresh_operation:${baseUrl}:${sessionId ?? ""}`;
      let operationId = crypto.randomUUID();
      try {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rotatingToken));
        const refreshHash = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
        const pending = JSON.parse(localStorage.getItem(operationStorageKey) || "null");
        if (pending?.refreshHash === refreshHash && pending.expiresAt > Date.now()) operationId = pending.id;
        else localStorage.setItem(operationStorageKey, JSON.stringify({ refreshHash, id: operationId, expiresAt: Date.now()+60000 }));
      } catch { /* Memory-only storage environments still receive an operation ID. */ }
      let response: Response | undefined;
      let tokens: TokenPair | null = null;
      // Retry a lost response with exactly the same operation key.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const received = await fetchBody<TokenPair>(`${baseUrl}/auth/refresh`, {
            method: "POST", headers: JSON_HEADERS,
            body: JSON.stringify({ refresh_token: rotatingToken, idempotency_key: operationId })
          });
          response = received.response;
          if (!sameSession()) return null;
          if (response.ok) tokens = received.body;
          if (response.status === 429 && attempt === 0) {
            const seconds = Number(response.headers?.get("Retry-After") ?? 1);
            if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 10) {
              await new Promise(resolve => setTimeout(resolve, seconds * 1000 + Math.random() * 250));
              if (!sameSession()) return null;
              continue;
            }
          }
          break;
        } catch (error) { if (attempt === 1) throw error; }
      }
      if (!tokens?.access_token || !tokens.refresh_token) {
        const current = storage?.getTokens();
        if (!sameSession()) return null;
        if (current && current.refresh_token !== rotatingToken) return current;
        // A transient server failure must not log a user out.
        if (clearOnFail && response?.status === 401) {
          storage?.setTokens(null);
        }
        refreshBlockedUntil = Date.now() + REFRESH_COOLDOWN_MS;
        return null;
      }
      const current = storage?.getTokens();
      // Do not resurrect a signed-out session or overwrite a newer account.
      if (!sameSession()) return null;
      if (storage && (!current || current.refresh_token !== rotatingToken)) return current ?? null;
      refreshBlockedUntil = 0;
      storage?.setTokens(tokens);
      try { localStorage.removeItem(operationStorageKey); } catch { /* unavailable */ }
      return tokens;
    };
    const coordinated = async () => {
      if (typeof navigator !== "undefined" && navigator.locks) {
        const waiting = new AbortController();
        const timer = setTimeout(() => waiting.abort(), 30000);
        try { return await navigator.locks.request(`ni-refresh:${baseUrl}`, { signal: waiting.signal }, rotate); }
        finally { clearTimeout(timer); }
      }
      // Lease fallback for browsers without Web Locks. Recheck ownership after
      // writing; the operation receipt makes any unavoidable retry idempotent.
      const key = `ni_refresh_lock:${baseUrl}`;
      const owner = crypto.randomUUID();
      const until = Date.now()+30000;
      if (typeof localStorage === "undefined") return rotate();
      while (Date.now() < until) {
        if (!sameSession()) return null;
        const adopted = adoptLatest();
        if (adopted) return adopted;
        let lease;
        try { lease = JSON.parse(localStorage.getItem(key) || "null"); } catch { return rotate(); }
        if (!lease || lease.expiresAt < Date.now()) {
          try { localStorage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now()+30000 })); } catch { return rotate(); }
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (JSON.parse(localStorage.getItem(key) || "null")?.owner === owner) {
            try { return await rotate(); }
            finally {
              if (JSON.parse(localStorage.getItem(key) || "null")?.owner === owner) localStorage.removeItem(key);
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      // Preserve the session when another tab is stalled; retry on the next request.
      return null;
    };
    refreshPromise = coordinated();
    sharedRefreshes.set(coordinationKey, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      sharedRefreshes.delete(coordinationKey);
      refreshPromise = null;
    }
  };

  return {
    request,
    auth: {
      login: (payload) =>
        request<AuthLoginResponse>({
          path: "/auth/login",
          method: "POST",
          body: payload,
          auth: false
        }),
      refresh: (payload) => refreshTokens(payload),
      logout: async (payload) => {
        await request<void>({ path: "/auth/logout", method: "POST", body: payload, auth: false });
      },
      register: (payload) =>
        request<UserRead>({
          path: "/auth/register",
          method: "POST",
          body: { ...payload, subscription: payload.subscription ?? 0 },
          auth: false
        }),
      me: () => request<UserRead>({ path: "/auth/me", method: "GET" })
    },
    lookup: {
      regions: (options = {}) =>
        request<RegionLookup[]>({
          path: `/lookup/regions${buildQuery({
            query: options.query,
            limit: options.limit
          })}`,
          method: "GET",
          auth: false,
          signal: options.signal
        }),
      schools: (options) =>
        request<SchoolLookup[]>({
          path: `/lookup/schools${buildQuery({
            region_id: options.regionId,
            query: options.query,
            limit: options.limit,
            offset: options.offset
          })}`,
          method: "GET",
          auth: false,
          signal: options.signal
        })
    },
    schoolSubmissions: {
      getMine: () =>
        request<SchoolSubmission | null>({
          path: "/users/me/school-submission",
          method: "GET"
        }),
      create: (payload) =>
        request<SchoolSubmission>({
          path: "/users/me/school-submissions",
          method: "POST",
          body: payload
        })
    }
  };
}

export type { ApiClient, LoginPayload, RefreshPayload, RegisterPayload };
