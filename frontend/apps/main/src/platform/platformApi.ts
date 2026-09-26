import type {
  ApiClient,
  AttemptRead,
  AttemptResult,
  AttemptView,
  OlympiadPublic,
  UserAnnouncement,
  UserRead,
  UserUpdate,
  TeacherRelation,
  SchoolSubmissionCreate
} from "@api";

export type PlatformApi = ReturnType<typeof createPlatformApi>;
export type OlympiadSubject = "math" | "cs";

export function createPlatformApi(client: ApiClient) {
  return {
    getProfile: (signal?: AbortSignal) =>
      client.request<UserRead>({ path: "/auth/me", method: "GET", signal }),
    getOlympiads: (signal?: AbortSignal) =>
      client.request<OlympiadPublic[]>({
        path: "/olympiads/my",
        method: "GET",
        signal
      }),
    getMyResults: (signal?: AbortSignal) =>
      client.request<AttemptResult[]>({ path: "/attempts/results/my", method: "GET", signal }),
    getAnnouncements: (signal?: AbortSignal) =>
      client.request<UserAnnouncement[]>({ path: "/users/me/announcements", method: "GET", signal }),
    getAttempt: (attemptId: number, signal?: AbortSignal) =>
      client.request<AttemptView>({ path: `/attempts/${attemptId}`, method: "GET", signal }),
    getAttemptResult: (attemptId: number, signal?: AbortSignal) =>
      client.request<AttemptResult>({ path: `/attempts/${attemptId}/result`, method: "GET", signal }),
    assignOlympiad: (subject: OlympiadSubject) =>
      client.request<OlympiadPublic>({
        path: "/olympiads/assign",
        method: "POST",
        body: { subject }
      }),
    startAttempt: (olympiadId: number) =>
      client.request<AttemptRead>({
        path: "/attempts/start",
        method: "POST",
        body: { olympiad_id: olympiadId }
      }),
    updateProfile: (body: UserUpdate) =>
      client.request<UserRead>({ path: "/users/me", method: "PUT", body }),
    requestEmailVerification: (email: string) =>
      client.request<{ status: string }>({
        path: "/auth/verify/request",
        method: "POST",
        auth: false,
        body: { email }
      }),
    getSchoolSubmission: () => client.schoolSubmissions.getMine(),
    createSchoolSubmission: (body: SchoolSubmissionCreate) => client.schoolSubmissions.create(body),
    getTeachers: (status: "confirmed" | "pending") =>
      client.request<TeacherRelation[]>({ path: `/student/teachers?status=${status}`, method: "GET" }),
    requestTeacher: (identifier: string) =>
      client.request<TeacherRelation>({
        path: "/student/teachers",
        method: "POST",
        body: { attach: { teacher_login: identifier } }
      }),
    confirmTeacher: (teacherId: number) =>
      client.request<TeacherRelation>({ path: `/student/teachers/${teacherId}/confirm`, method: "POST" }),
    removeTeacher: (teacherId: number) =>
      client.request<void>({ path: `/student/teachers/${teacherId}`, method: "DELETE" })
  };
}
