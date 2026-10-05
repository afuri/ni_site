import type { UserRead, UserRole } from "@api";

export const LOGIN_REDIRECT_KEY = "ni_login_redirect";
export const STUDENT_OLYMPIADS_SECTION_ID = "available-olympiads";
export const STUDENT_OLYMPIADS_PATH = `/platform#${STUDENT_OLYMPIADS_SECTION_ID}`;

type RoleSource = UserRole | Pick<UserRead, "role"> | null | undefined;

export function getAccountHomePath(source: RoleSource): "/platform" | "/cabinet" {
  const role = typeof source === "string" ? source : source?.role;
  return role === "student" ? "/platform" : "/cabinet";
}
