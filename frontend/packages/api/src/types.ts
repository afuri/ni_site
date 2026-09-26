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
  school_full_name: string;
  address?: string | null;
  url: string;
  email?: string | null;
};

export type SchoolSubmission = Omit<SchoolSubmissionCreate, "school_full_name" | "url"> & {
  school_full_name: string | null;
  url: string | null;
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

export type UserUpdate = {
  surname?: string;
  name?: string;
  father_name?: string | null;
  region_id?: number | null;
  school_id?: number | null;
  school_not_found?: boolean;
  class_grade?: number | null;
  gender?: "male" | "female" | null;
  manual_teachers?: ManualTeacher[];
};

export type TeacherRelation = {
  id: number;
  teacher_id: number;
  student_id: number;
  status: "pending" | "confirmed" | "rejected";
  requested_by: "teacher" | "student" | null;
  created_at: string;
  confirmed_at: string | null;
  teacher_surname: string | null;
  teacher_name: string | null;
  teacher_father_name: string | null;
  teacher_subject: string | null;
};

export type OlympiadPublic = {
  id: number;
  title: string;
  description: string | null;
  age_group: string;
  attempts_limit: number;
  duration_sec: number;
  available_from: string;
  available_to: string;
  pass_percent: number;
  is_published: boolean;
  results_released: boolean;
};

export type AttemptStatus = "active" | "submitted" | "expired";

export type AttemptResult = {
  attempt_id: number;
  olympiad_id: number;
  olympiad_title: string | null;
  /** Start date of the olympiad; used for school-year grouping, never the grading date. */
  olympiad_available_from?: string | null;
  status: AttemptStatus;
  score_total: number;
  score_max: number;
  percent: number;
  passed: boolean | null;
  graded_at: string | null;
  results_released: boolean;
};

export type AttemptRead = {
  id: number;
  olympiad_id: number;
  user_id: number;
  started_at: string;
  deadline_at: string;
  duration_sec: number;
  status: AttemptStatus;
  score_total: number;
  score_max: number;
  passed: boolean | null;
  graded_at: string | null;
};

export type AttemptTask = {
  task_id: number;
  title: string;
  content: string;
  task_type: "single_choice" | "multi_choice" | "short_text";
  image_key: string | null;
  payload: Record<string, unknown> & {
    options?: Array<{ id: string; text: string }>;
  };
  sort_order: number;
  max_score: number;
  current_answer: {
    task_id: number;
    answer_payload: Record<string, unknown>;
    updated_at: string;
  } | null;
  is_correct: boolean | null;
};

export type AttemptView = {
  attempt: AttemptRead;
  olympiad_title: string;
  tasks: AttemptTask[];
};

export type UserAnnouncement = {
  campaign_code: string;
  subject: "math" | "cs" | null;
  group_number: number | null;
  title: string;
  text: string;
  starts_at: string | null;
  ends_at: string | null;
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
