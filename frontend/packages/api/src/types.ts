export type UserRole = "student" | "teacher" | "admin";

export type SchoolStatus =
  | "selected"
  | "missing"
  | "submission_pending"
  | "submission_rejected"
  | "not_required";

export type RegionLookup = {
  id: number;
  name: string;
  country_code: string | null;
  is_other: boolean;
};

export type SchoolLookup = {
  id: number;
  short_name: string;
  full_name: string;
  city: string;
};

export type SchoolSubmissionStatus = "pending" | "approved" | "rejected";

export type SchoolSubmissionCreate = {
  country_name?: string | null;
  region_name?: string | null;
  city_name: string;
  school_short_name: string;
  school_full_name?: string | null;
  address?: string | null;
  url?: string | null;
  email?: string | null;
};

export type SchoolSubmission = SchoolSubmissionCreate & {
  id: number;
  user_id: number;
  region_id: number;
  status: SchoolSubmissionStatus;
  admin_comment: string | null;
  resolved_school_id: number | null;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  must_change_password?: boolean;
};

export type ManualTeacher = {
  id: number;
  full_name: string;
  subject: string;
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
  created_at: string;
  surname: string;
  name: string;
  father_name: string | null;
  country: string | null;
  city: string | null;
  school: string | null;
  region_id: number | null;
  region_name: string | null;
  school_id: number | null;
  school_short_name: string | null;
  school_full_name: string | null;
  city_name: string | null;
  school_status: SchoolStatus;
  coins: number;
  class_grade: number | null;
  gender: "male" | "female" | null;
  subscription: number;
  manual_teachers: ManualTeacher[];
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
