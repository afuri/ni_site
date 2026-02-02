import type {
  ApiError,
  ApiErrorResponse,
  AuthStorage,
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
};

type ClientOptions = {
  baseUrl: string;
  storage?: AuthStorage;
  onAuthError?: () => void;
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
  country: string;
  city: string;
  school: string;
  class_grade: number | null;
  subject: string | null;
};

type ApiClient = {
  request: <T>(options: RequestOptions) => Promise<T>;
  auth: {
    login: (payload: LoginPayload) => Promise<TokenPair>;
    refresh: (payload?: RefreshPayload) => Promise<TokenPair | null>;
    logout: (payload: RefreshPayload) => Promise<void>;
    register: (payload: RegisterPayload) => Promise<UserRead>;
    me: () => Promise<UserRead>;
  };
  lookup: {
    cities: (options?: { query?: string; limit?: number }) => Promise<string[]>;
    schools: (options: { city: string; query?: string; limit?: number }) => Promise<string[]>;
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
  return {
    status: response.status,
    code: payload?.error?.code ?? fallbackCode,
    message: payload?.error?.message ?? payload?.error?.code ?? fallbackCode,
    details: payload?.error?.details ?? {},
    request_id: payload?.request_id
  };
}

export function createApiClient(options: ClientOptions): ApiClient {
  const { baseUrl, storage, onAuthError } = options;

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
      signal
    } = requestOptions;

    const token = auth ? storage?.getTokens()?.access_token : null;
    const initHeaders: Record<string, string> = {
      ...headers
    };
    if (!(body instanceof FormData) && body !== undefined) {
      Object.assign(initHeaders, JSON_HEADERS);
    }
    if (token) {
      initHeaders.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: initHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal
    });

    if (response.status === 401 && retryOnAuth && auth && storage) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        return request<T>(requestOptions, false);
      }
      onAuthError?.();
    }

    if (!response.ok) {
      const payload = await parseJson<ApiErrorResponse>(response);
      throw buildApiError(response, payload);
    }

    const payload = await parseJson<T>(response);
    return (payload ?? (undefined as T));
  };

  const refreshTokens = async (payload?: RefreshPayload): Promise<TokenPair | null> => {
    const refreshToken = payload?.refresh_token ?? storage?.getTokens()?.refresh_token;
    const clearOnFail = payload?.clearOnFail ?? true;
    if (!refreshToken) {
      return null;
    }
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
      if (clearOnFail) {
        storage?.setTokens(null);
      }
      return null;
    }

    const tokens = await parseJson<TokenPair>(response);
    if (!tokens) {
      return null;
    }
    storage?.setTokens(tokens);
    return tokens;
  };

  return {
    request,
    auth: {
      login: (payload) =>
        request<TokenPair>({
          path: "/auth/login",
          method: "POST",
          body: payload,
          auth: false
        }),
      refresh: (payload) => refreshTokens(payload),
      logout: async (payload) => {
        await request<void>({
          path: "/auth/logout",
          method: "POST",
          body: payload,
          auth: false
        });
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
      cities: (options = {}) =>
        request<string[]>({
          path: `/lookup/cities${buildQuery({
            query: options.query,
            limit: options.limit
          })}`,
          method: "GET",
          auth: false
        }),
      schools: (options) =>
        request<string[]>({
          path: `/lookup/schools${buildQuery({
            city: options.city,
            query: options.query,
            limit: options.limit
          })}`,
          method: "GET",
          auth: false
        })
    }
  };
}

export type { ApiClient, LoginPayload, RefreshPayload, RegisterPayload };
