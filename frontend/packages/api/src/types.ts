export type UserRole = "student" | "teacher" | "admin";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  must_change_password?: boolean;
};

export type UserRead = {
  id: number;
  login: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_email_verified: boolean;
  must_change_password: boolean;
  is_moderator: boolean;
  moderator_requested: boolean;
  surname: string;
  name: string;
  father_name: string | null;
  country: string;
  city: string;
  school: string;
  class_grade: number | null;
  subject: string | null;
};

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  error: ApiErrorPayload;
  request_id?: string;
};

export type ApiError = ApiErrorPayload & {
  status: number;
  request_id?: string;
};

export type AuthStorage = {
  getTokens: () => TokenPair | null;
  setTokens: (tokens: TokenPair | null) => void;
  getUser?: () => UserRead | null;
  setUser?: (user: UserRead | null) => void;
};
